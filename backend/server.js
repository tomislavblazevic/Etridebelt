const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 5050);
const isProduction = process.env.NODE_ENV === 'production';
const maxTodos = 100;
const maxTextLength = 500;
const sessionMaxAge = 7 * 24 * 60 * 60 * 1000;
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const usersFile = path.join(dataDir, 'users.json');
const sessionsFile = path.join(dataDir, 'sessions.json');
const todosFile = path.resolve(process.env.DATA_FILE || path.join(dataDir, 'todos.json'));
const allowedOrigins = (process.env.CORS_ORIGINS || (isProduction ? '' : 'http://localhost:3000'))
  .split(',').map((value) => value.trim()).filter(Boolean);

if (isProduction && allowedOrigins.length === 0) throw new Error('CORS_ORIGINS must be configured in production.');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'X-CSRF-Token'],
  maxAge: 86400,
}));
app.use(express.json({ limit: '10kb', strict: true }));
app.use(cookieParser());

const rateBuckets = new Map();
function limiter(limit, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip || req.socket.remoteAddress || 'unknown'}:${req.path}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      rateBuckets.set(key, { startedAt: now, count: 1 });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > limit) return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    return next();
  };
}
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, bucket] of rateBuckets) if (bucket.startedAt < cutoff) rateBuckets.delete(key);
}, 60_000).unref();

let users = [];
let sessions = [];
let legacyTodos = [];
let todosByUser = new Map();
let writeChain = Promise.resolve();

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

function persistJson(file, value) {
  writeChain = writeChain.then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(temp, file);
  });
  return writeChain;
}

async function loadData() {
  users = await readJson(usersFile, []);
  sessions = await readJson(sessionsFile, []);
  legacyTodos = await readJson(todosFile, []);
  const normalizedUsers = Array.isArray(users) ? users : [];
  users = normalizedUsers.filter((user) => user && typeof user.id === 'string' && typeof user.email === 'string' && typeof user.passwordHash === 'string');
  todosByUser = new Map();
  if (legacyTodos && !Array.isArray(legacyTodos) && typeof legacyTodos === 'object') {
    for (const user of users) todosByUser.set(user.id, Array.isArray(legacyTodos[user.id]) ? legacyTodos[user.id] : []);
  } else {
    for (const user of users) todosByUser.set(user.id, []);
  }
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
function validateCredentials(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be an object.';
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return 'Enter a valid email address.';
  if (password.length < 12 || password.length > 128) return 'Password must be 12-128 characters.';
  return null;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, encoded) {
  const parts = typeof encoded === 'string' ? encoded.split('$') : [];
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const hash = crypto.scryptSync(password, parts[1], 64, { N: 16384, r: 8, p: 1 });
    const expected = Buffer.from(parts[2], 'hex');
    return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
  } catch { return false; }
}

function publicUser(user) { return { id: user.id, email: user.email, createdAt: user.createdAt }; }
function sessionCookieOptions() {
  return { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax', maxAge: sessionMaxAge, path: '/' };
}

function currentUser(req) {
  const token = req.cookies.session;
  if (!token) return null;
  const session = sessions.find((item) => item.token === token && item.expiresAt > Date.now());
  if (!session) return null;
  return users.find((user) => user.id === session.userId) || null;
}
function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ message: 'Authentication required.' });
  req.user = user;
  return next();
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/csrf', (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('_csrf', token, { httpOnly: false, secure: isProduction, sameSite: isProduction ? 'none' : 'lax', maxAge: 60 * 60 * 1000, path: '/' });
  res.set('Cache-Control', 'no-store');
  res.json({ csrfToken: token });
});

function validateCsrf(req, res, next) {
  const cookieToken = req.cookies._csrf;
  const headerToken = req.get('X-CSRF-Token');
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length || !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }
  return next();
}

function validateTodoPayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be an object.';
  if (!partial && typeof body.text !== 'string') return 'Todo text is required.';
  if (body.text !== undefined && (typeof body.text !== 'string' || !body.text.trim() || body.text.trim().length > maxTextLength)) return `Todo text must be 1-${maxTextLength} characters.`;
  if (body.completed !== undefined && typeof body.completed !== 'boolean') return 'completed must be a boolean.';
  if (body.id !== undefined && (typeof body.id !== 'string' || body.id.length > 100)) return 'Invalid todo id.';
  return null;
}

function getUserTodos(userId) { return todosByUser.get(userId) || []; }
function setUserTodos(userId, todos) { todosByUser.set(userId, todos); }
function persistTodos() { return persistJson(todosFile, Object.fromEntries(todosByUser)); }

app.post('/auth/register', limiter(5, 15 * 60_000), validateCsrf, async (req, res, next) => {
  try {
    const error = validateCredentials(req.body);
    if (error) return res.status(400).json({ message: error });
    const email = normalizeEmail(req.body.email);
    if (users.some((user) => user.email === email)) return res.status(409).json({ message: 'An account with this email already exists.' });
    const user = { id: crypto.randomUUID(), email, passwordHash: hashPassword(req.body.password), createdAt: new Date().toISOString() };
    users.push(user);
    setUserTodos(user.id, []);
    await persistJson(usersFile, users);
    await persistTodos();
    const token = crypto.randomBytes(32).toString('hex');
    sessions.push({ token, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + sessionMaxAge });
    await persistJson(sessionsFile, sessions);
    res.cookie('session', token, sessionCookieOptions());
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) { return next(error); }
});

app.post('/auth/login', limiter(10, 15 * 60_000), validateCsrf, async (req, res, next) => {
  try {
    const error = validateCredentials(req.body);
    if (error) return res.status(400).json({ message: error });
    const email = normalizeEmail(req.body.email);
    const user = users.find((item) => item.email === email);
    const valid = user ? verifyPassword(req.body.password, user.passwordHash) : false;
    if (!valid) return res.status(401).json({ message: 'Invalid email or password.' });
    const token = crypto.randomBytes(32).toString('hex');
    sessions = sessions.filter((item) => item.expiresAt > Date.now() && item.userId !== user.id);
    sessions.push({ token, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + sessionMaxAge });
    await persistJson(sessionsFile, sessions);
    res.cookie('session', token, sessionCookieOptions());
    return res.json({ user: publicUser(user) });
  } catch (error) { return next(error); }
});

app.post('/auth/logout', limiter(20, 60_000), validateCsrf, async (req, res, next) => {
  try {
    const token = req.cookies.session;
    sessions = sessions.filter((item) => item.token !== token);
    await persistJson(sessionsFile, sessions);
    res.clearCookie('session', { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax', path: '/' });
    return res.status(204).send();
  } catch (error) { return next(error); }
});

app.get('/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get('/todos', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getUserTodos(req.user.id));
});

app.post('/todos', requireAuth, limiter(60, 60_000), validateCsrf, async (req, res, next) => {
  try {
    const validationError = validateTodoPayload(req.body);
    if (validationError) return res.status(400).json({ message: validationError });
    const todos = getUserTodos(req.user.id);
    if (todos.length >= maxTodos) return res.status(409).json({ message: `Maximum of ${maxTodos} todos reached.` });
    const id = typeof req.body.id === 'string' ? req.body.id : crypto.randomUUID();
    const existing = todos.find((todo) => todo.id === id);
    if (existing) return res.status(200).json(existing);
    const todo = { id, text: req.body.text.trim().replace(/\s+/g, ' '), completed: Boolean(req.body.completed) };
    todos.push(todo);
    setUserTodos(req.user.id, todos);
    await persistTodos();
    return res.status(201).json(todo);
  } catch (error) { return next(error); }
});

app.put('/todos/:id', requireAuth, limiter(60, 60_000), validateCsrf, async (req, res, next) => {
  try {
    const validationError = validateTodoPayload(req.body, { partial: true });
    if (validationError) return res.status(400).json({ message: validationError });
    const todos = getUserTodos(req.user.id);
    const todo = todos.find((item) => item.id === req.params.id);
    if (!todo) return res.status(404).json({ message: 'Todo not found.' });
    if (req.body.text !== undefined) todo.text = req.body.text.trim().replace(/\s+/g, ' ');
    if (req.body.completed !== undefined) todo.completed = req.body.completed;
    setUserTodos(req.user.id, todos);
    await persistTodos();
    return res.json(todo);
  } catch (error) { return next(error); }
});

app.delete('/todos/:id', requireAuth, limiter(60, 60_000), validateCsrf, async (req, res, next) => {
  try {
    const todos = getUserTodos(req.user.id);
    const nextTodos = todos.filter((todo) => todo.id !== req.params.id);
    if (nextTodos.length === todos.length) return res.status(404).json({ message: 'Todo not found.' });
    setUserTodos(req.user.id, nextTodos);
    await persistTodos();
    return res.status(204).send();
  } catch (error) { return next(error); }
});

app.use((req, res) => res.status(404).json({ message: 'Not found.' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.message === 'Origin not allowed by CORS') return res.status(403).json({ message: 'Origin not allowed.' });
  console.error(error);
  return res.status(500).json({ message: 'Internal server error.' });
});

let server;
let shuttingDown = false;

function logRuntimeEvent(label, value) {
  const detail = value instanceof Error
    ? `${value.name}: ${value.message}\n${value.stack || ''}`
    : value;
  console.error(`[Etridebelt backend] ${label}${detail ? `\n${detail}` : ''}`);
}

async function start() {
  try {
    await loadData();
    // Expire old sessions on startup.
    sessions = sessions.filter((item) => item.expiresAt > Date.now());
    await persistJson(sessionsFile, sessions);

    server = app.listen(port);
    server.once('listening', () => {
      const address = server.address();
      const bound = typeof address === 'object' && address ? `${address.address}:${address.port}` : String(address);
      console.log(`Etridebelt API listening on ${bound}`);
      console.log(`Health check: http://localhost:${port}/health`);
    });
    server.on('error', (error) => logRuntimeEvent('server error', error));
    server.on('close', () => console.log('[Etridebelt backend] HTTP server closed.'));
  } catch (error) {
    logRuntimeEvent('startup failed', error);
    process.exitCode = 1;
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Etridebelt backend] ${signal}: shutting down`);
  if (!server) return;
  await new Promise((resolve) => {
    server.close(resolve);
    setTimeout(resolve, 10000).unref();
  });
  await writeChain.catch((error) => logRuntimeEvent('pending write failed during shutdown', error));
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  logRuntimeEvent('uncaughtException', error);
  process.exitCode = 1;
  void shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logRuntimeEvent('unhandledRejection', reason);
  process.exitCode = 1;
});
process.on('beforeExit', (code) => {
  logRuntimeEvent(`beforeExit code=${code}`, 'Node has no active event-loop handles.');
});
process.on('exit', (code) => {
  console.log(`[Etridebelt backend] process exiting with code ${code}`);
});

if (require.main === module) void start();
module.exports = { app, validateTodoPayload, validateCredentials, hashPassword, verifyPassword };
