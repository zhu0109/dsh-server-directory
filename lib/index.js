import { join, posix } from "node:path";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Client } from "ssh2";
import { Client as Client$1, FileType } from "basic-ftp";
// src/host/errors.ts
const STATUS_BY_CODE = {
	bad_request: 400,
	auth_failed: 401,
	permission_denied: 403,
	not_found: 404,
	not_connected: 409,
	conflict: 409,
	timeout: 504,
	connection_failed: 502,
	disconnected: 503,
	unknown_host_key: 409,
	host_key_changed: 409,
	tls_error: 502,
	unsupported: 501,
	internal: 500
};
/** A deliberate, safe-to-show operation failure. */
var RemoteError = class extends Error {
	code;
	status;
	details;
	constructor(code, message, details) {
		super(message);
		this.name = "RemoteError";
		this.code = code;
		this.status = STATUS_BY_CODE[code];
		this.details = details;
	}
};
function remoteError(code, message, details) {
	return new RemoteError(code, message, details);
}
/** Never echo a password if a third-party library happened to include it. */
function sanitizeMessage(message) {
	return message.replace(/(password|passwd|pwd)\s*[=:]\s*(?:"[^"]*"|'[^']*'|\S+)/gi, "$1=***").replace(/\r?\n/g, " ").slice(0, 500);
}
function isErrorCode(value) {
	return typeof value === "string" && Object.prototype.hasOwnProperty.call(STATUS_BY_CODE, value);
}
/**
* Translate node/ssh2/basic-ftp errors into a stable API error.
* @param error - Raw failure from an adapter or route.
* @param fallback - Code used when no more specific match is possible.
*/
function mapError(error, fallback = "internal") {
	if (error instanceof RemoteError) return error;
	const raw = error;
	const message = sanitizeMessage(typeof raw?.message === "string" ? raw.message : String(error ?? "unknown error"));
	const lower = message.toLowerCase();
	const code = raw?.code;
	if (typeof code === "string") {
		if (isErrorCode(code)) return new RemoteError(code, message);
		if (code === "ENOTFOUND" || code === "EAI_AGAIN") return new RemoteError("connection_failed", `无法解析服务器地址：${message}`);
		if (code === "ECONNREFUSED" || code === "EHOSTUNREACH" || code === "ENETUNREACH") return new RemoteError("connection_failed", `无法连接到服务器：${message}`);
		if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return new RemoteError("timeout", `连接超时：${message}`);
		if (code === "ECONNRESET" || code === "EPIPE" || code === "ECONNABORTED") return new RemoteError("disconnected", `连接已断开：${message}`);
		if (code.startsWith("ERR_TLS") || code.startsWith("CERT_") || code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "SELF_SIGNED_CERT_IN_CHAIN" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") return new RemoteError("tls_error", `TLS 证书校验失败：${message}`);
	}
	if (typeof code === "number") {
		if (code === 2) return new RemoteError("not_found", `远端路径不存在：${message}`);
		if (code === 3) return new RemoteError("permission_denied", `没有权限访问远端路径：${message}`);
		if (code === 4) return new RemoteError("internal", `远端服务器拒绝操作：${message}`);
		if (code === 530) return new RemoteError("auth_failed", "账号或密码错误。");
		if (code === 421) return new RemoteError("timeout", "FTP 服务器关闭了连接。");
		if (code === 550) return new RemoteError("permission_denied", "FTP 服务器拒绝访问该路径（不存在或无权限）。");
		if (code === 553) return new RemoteError("bad_request", "FTP 服务器拒绝了文件名。");
		if (code === 425) return new RemoteError("connection_failed", "FTP 无法建立数据传输连接。");
	}
	if (raw?.level === "client-authentication" || lower.includes("authentication methods failed") || lower.includes("all configured authentication methods failed") || lower.includes("login incorrect")) return new RemoteError("auth_failed", "账号或密码错误，或服务器不允许密码登录。");
	if (lower.includes("host key") || lower.includes("host denied") || lower.includes("verification failed")) return new RemoteError("unknown_host_key", "服务器主机密钥未确认。");
	if (lower.includes("timed out") || lower.includes("timeout")) return new RemoteError("timeout", `操作超时：${message}`);
	if (lower.includes("certificate") || lower.includes("tls") || lower.includes("ssl")) return new RemoteError("tls_error", `TLS 连接失败：${message}`);
	if (lower.includes("no such file") || lower.includes("not found") || lower.includes("does not exist")) return new RemoteError("not_found", `远端路径不存在：${message}`);
	if (lower.includes("permission denied") || lower.includes("access denied") || lower.includes("not allowed")) return new RemoteError("permission_denied", `没有权限执行该操作：${message}`);
	if (lower.includes("already exists")) return new RemoteError("conflict", `目标已存在：${message}`);
	if (lower.includes("connection") && (lower.includes("closed") || lower.includes("lost") || lower.includes("reset"))) return new RemoteError("disconnected", `连接已断开：${message}`);
	if (typeof raw?.status === "number") {
		if (raw.status === 530) return new RemoteError("auth_failed", "账号或密码错误。");
		if (raw.status === 421) return new RemoteError("timeout", "FTP 服务器关闭了连接。");
		if (raw.status === 550) return new RemoteError("permission_denied", "FTP 服务器拒绝访问该路径（不存在或无权限）。");
	}
	return new RemoteError(fallback, message || "操作失败。");
}
// src/host/path.ts
/**
* Remote paths are always POSIX paths, independent of the Windows host that
* runs DSH. Every path from the browser passes through these helpers before
* it reaches an SFTP/FTP adapter.
*/
const CONTROL_CHARS = /[\u0000-\u0008\u000a-\u001f\u007f]/u;
function normalizeAbsolute(path) {
	if (path === "" || path === ".") return "/";
	let normalized = posix.normalize(path);
	if (!normalized.startsWith("/")) normalized = `/${normalized}`;
	if (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1);
	return normalized || "/";
}
/**
* Resolve a user-entered path against the remote home directory.
* Supports absolute paths, relative paths and `~`/`~/...`.
*/
function resolveRemotePath(input, home) {
	const rawHome = normalizeAbsolute(home || "/");
	let value = typeof input === "string" ? input.trim() : "";
	if (value === "") value = rawHome;
	if (CONTROL_CHARS.test(value)) throw remoteError("bad_request", "路径包含非法控制字符。");
	if (value === "~") return rawHome;
	if (value.startsWith("~/")) value = posix.join(rawHome, value.slice(2));
	else if (!value.startsWith("/")) value = posix.join(rawHome, value);
	return normalizeAbsolute(value);
}
/** Make sure a path is absolute/safe before handing it to a remote command. */
function assertSafeRemotePath(path) {
	if (typeof path !== "string" || path.trim() === "") throw remoteError("bad_request", "路径不能为空。");
	if (CONTROL_CHARS.test(path)) throw remoteError("bad_request", "路径包含非法控制字符。");
	return normalizeAbsolute(path);
}
/** Validate a single remote path segment (new folder name / new file name). */
function sanitizeRemoteName(input) {
	if (typeof input !== "string") throw remoteError("bad_request", "名称不能为空。");
	const name = input.trim();
	if (name === "" || name === "." || name === "..") throw remoteError("bad_request", "名称不能为空或为 . / ..。");
	if (name.includes("/") || name.includes("\\")) throw remoteError("bad_request", "名称不能包含路径分隔符。");
	if (CONTROL_CHARS.test(name)) throw remoteError("bad_request", "名称包含非法控制字符。");
	if (Buffer.byteLength(name, "utf8") > 255) throw remoteError("bad_request", "名称过长（最多 255 字节）。");
	return name;
}
/** Join a directory and a validated child name. */
function joinRemotePath(parent, name) {
	return normalizeAbsolute(posix.join(assertSafeRemotePath(parent), sanitizeRemoteName(name)));
}
/** Parent of an absolute remote path; root stays root. */
function parentRemotePath(path) {
	const normalized = normalizeAbsolute(path);
	return normalized === "/" ? "/" : normalizeAbsolute(posix.dirname(normalized));
}
/** Deleting the remote root is never offered, even for administrators. */
function assertDeletableRemotePath(path) {
	const normalized = assertSafeRemotePath(path);
	if (normalized === "/") throw remoteError("bad_request", "拒绝删除远端根目录 /。");
	return normalized;
}
/** Base name used for download disposition. */
function remoteBaseName(path) {
	const normalized = normalizeAbsolute(path);
	return normalized === "/" ? "root" : posix.basename(normalized);
}
// src/host/store.ts
/**
* File-backed server inventory.
*
* Layout under the DSH home directory:
*   server-directory/servers.json     no secrets
*   server-directory/secrets.json     passwords only
*   server-directory/known_hosts.json SFTP host fingerprints
*
* Writes are serialized and atomic; reads observe complete files thanks to the
* temp-file + rename commit. Passwords are never included in a public record.
*/
const SERVER_PROTOCOLS = [
	"sftp",
	"ftp",
	"ftps",
	"ftpsi"
];
function isServerProtocol(value) {
	return typeof value === "string" && SERVER_PROTOCOLS.includes(value);
}
function defaultPort(protocol) {
	if (protocol === "sftp") return 22;
	if (protocol === "ftpsi") return 990;
	return 21;
}
function resolveDataDir(env = process.env) {
	const home = env.DSH_HOME?.trim() || join(homedir(), ".dsh");
	return join(home, "server-directory");
}
function knownHostKey(host, port) {
	return `${host.trim().toLowerCase()}:${port}`;
}
function toPublicServer(server, hasPassword) {
	return {
		...server,
		hasPassword
	};
}
function emptyServers() {
	return {
		version: 1,
		servers: []
	};
}
function emptySecrets() {
	return {
		version: 1,
		byServerId: {}
	};
}
function emptyKnownHosts() {
	return {
		version: 1,
		keys: {}
	};
}
function asObject(value) {
	return typeof value === "object" && value !== null ? value : void 0;
}
function finitePort(value, fallback) {
	const port = Number(value);
	if (!Number.isInteger(port) || port < 1 || port > 65535) return fallback;
	return port;
}
var ServerStore = class {
	dataDir;
	logger;
	serversPath;
	secretsPath;
	knownHostsPath;
	initPromise;
	writeChain = Promise.resolve();
	constructor(options) {
		this.dataDir = options.dataDir;
		this.logger = options.logger;
		this.serversPath = join(this.dataDir, "servers.json");
		this.secretsPath = join(this.dataDir, "secrets.json");
		this.knownHostsPath = join(this.dataDir, "known_hosts.json");
	}
	async init() {
		if (!this.initPromise) this.initPromise = (async () => {
			await mkdir(this.dataDir, {
				recursive: true,
				mode: 448
			});
			try {
				await chmod(this.dataDir, 448);
			} catch {}
		})();
		return this.initPromise;
	}
	async ensureInit() {
		await this.init();
	}
	withWrite(operation) {
		const next = this.writeChain.then(operation, operation);
		this.writeChain = next.catch(() => void 0);
		return next;
	}
	async readJson(path, repairValue) {
		await this.ensureInit();
		let text;
		try {
			text = await readFile(path, "utf8");
		} catch (error) {
			if (error?.code === "ENOENT") return repairValue();
			throw error;
		}
		try {
			const parsed = JSON.parse(text);
			if (asObject(parsed) !== void 0) return parsed;
			throw new Error("document is not an object");
		} catch (error) {
			this.logger?.warn?.(`[dsh-server-directory] ${path} is corrupt; preserving it and using an empty document`);
			try {
				await rename(path, `${path}.corrupt-${Date.now()}`);
			} catch {}
			return repairValue();
		}
	}
	async writeJson(path, value) {
		await this.ensureInit();
		const temp = `${path}.${randomUUID()}.tmp`;
		const payload = `${JSON.stringify(value, null, 2)}\n`;
		try {
			await writeFile(temp, payload, {
				encoding: "utf8",
				mode: 384,
				flag: "wx"
			});
			try {
				await chmod(temp, 384);
			} catch {}
			let lastError;
			for (let attempt = 0; attempt < 4; attempt += 1) try {
				await rename(temp, path);
				return;
			} catch (error) {
				lastError = error;
				await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
			}
			throw lastError;
		} catch (error) {
			try {
				await rm(temp, { force: true });
			} catch {}
			throw error;
		}
	}
	async readServersDoc() {
		const doc = await this.readJson(this.serversPath, emptyServers);
		if (!Array.isArray(doc.servers)) doc.servers = [];
		return doc;
	}
	async readSecretsDoc() {
		const doc = await this.readJson(this.secretsPath, emptySecrets);
		if (asObject(doc.byServerId) === void 0) doc.byServerId = {};
		return doc;
	}
	async readKnownHostsDoc() {
		const doc = await this.readJson(this.knownHostsPath, emptyKnownHosts);
		if (asObject(doc.keys) === void 0) doc.keys = {};
		return doc;
	}
	/** Normalize a stored record so an old/partial file cannot crash the API. */
	normalizeRecord(raw) {
		const value = asObject(raw);
		if (!value) return void 0;
		const id = typeof value.id === "string" ? value.id.trim() : "";
		const host = typeof value.host === "string" ? value.host.trim() : "";
		const username = typeof value.username === "string" ? value.username.trim() : "";
		if (!id || !host || !username) return void 0;
		const protocol = isServerProtocol(value.protocol) ? value.protocol : "sftp";
		return {
			id,
			name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : host,
			protocol,
			host,
			port: finitePort(value.port, defaultPort(protocol)),
			username,
			allowInvalidCert: value.allowInvalidCert === true,
			createdAt: typeof value.createdAt === "number" ? value.createdAt : Date.now(),
			updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now()
		};
	}
	async listServers() {
		return (await this.readServersDoc()).servers.map((record) => this.normalizeRecord(record)).filter((record) => !!record);
	}
	async getServer(id) {
		return (await this.listServers()).find((server) => server.id === id);
	}
	async hasPassword(id) {
		const secrets = await this.readSecretsDoc();
		return typeof secrets.byServerId[id]?.password === "string" && secrets.byServerId[id]?.password !== "";
	}
	async getPassword(id) {
		const password = (await this.readSecretsDoc()).byServerId[id]?.password;
		return typeof password === "string" && password !== "" ? password : void 0;
	}
	async saveServer(input) {
		return this.withWrite(async () => {
			const serversDoc = await this.readServersDoc();
			const secrets = await this.readSecretsDoc();
			const id = typeof input.id === "string" && input.id.trim() ? input.id.trim() : randomUUID();
			const existing = serversDoc.servers.map((record) => this.normalizeRecord(record)).find((record) => record?.id === id);
			const protocol = input.protocol ?? existing?.protocol ?? "sftp";
			if (!isServerProtocol(protocol)) throw remoteError("bad_request", "不支持的连接协议。");
			const host = String(input.host ?? existing?.host ?? "").trim();
			if (!host) throw remoteError("bad_request", "服务器地址不能为空。");
			if (/\s/.test(host)) throw remoteError("bad_request", "服务器地址不能包含空白字符。");
			if (host.includes("://")) throw remoteError("bad_request", "请只填写主机名或 IP，不要包含协议前缀。");
			const username = String(input.username ?? existing?.username ?? "").trim();
			if (!username) throw remoteError("bad_request", "用户名不能为空。");
			const port = finitePort(input.port ?? existing?.port, defaultPort(protocol));
			const now = Date.now();
			const record = {
				id,
				name: String(input.name ?? existing?.name ?? host).trim() || host,
				protocol,
				host,
				port,
				username,
				allowInvalidCert: input.allowInvalidCert ?? existing?.allowInvalidCert ?? false,
				createdAt: existing?.createdAt ?? now,
				updatedAt: now
			};
			const nextServers = serversDoc.servers.map((item) => this.normalizeRecord(item)).filter((item) => !!item);
			const index = nextServers.findIndex((item) => item.id === id);
			if (index >= 0) nextServers[index] = record;
			else nextServers.push(record);
			const passwordInput = typeof input.password === "string" ? input.password : void 0;
			if (passwordInput !== void 0 && passwordInput !== "") secrets.byServerId[id] = { password: passwordInput };
			else if (!existing && !secrets.byServerId[id]?.password) throw remoteError("bad_request", "密码不能为空。");
			await this.writeJson(this.serversPath, {
				version: 1,
				servers: nextServers
			});
			await this.writeJson(this.secretsPath, secrets);
			return record;
		});
	}
	async deleteServer(id) {
		return this.withWrite(async () => {
			const all = (await this.readServersDoc()).servers.map((record) => this.normalizeRecord(record)).filter((record) => !!record);
			const record = all.find((item) => item.id === id);
			if (!record) return { deleted: false };
			const remaining = all.filter((item) => item.id !== id);
			const secrets = await this.readSecretsDoc();
			delete secrets.byServerId[id];
			await this.writeJson(this.serversPath, {
				version: 1,
				servers: remaining
			});
			await this.writeJson(this.secretsPath, secrets);
			if (!remaining.some((server) => server.host.toLowerCase() === record.host.toLowerCase() && server.port === record.port)) {
				const known = await this.readKnownHostsDoc();
				const key = knownHostKey(record.host, record.port);
				if (known.keys[key]) {
					delete known.keys[key];
					await this.writeJson(this.knownHostsPath, known);
				}
			}
			return {
				deleted: true,
				record
			};
		});
	}
	async getKnownHost(host, port) {
		return (await this.readKnownHostsDoc()).keys[knownHostKey(host, port)];
	}
	async trustHost(host, port, fingerprint) {
		const normalized = fingerprint.replace(/^SHA256:/i, "").toLowerCase();
		if (!/^[a-f0-9]{64}$/.test(normalized)) throw remoteError("internal", "主机指纹格式无效。");
		await this.withWrite(async () => {
			const doc = await this.readKnownHostsDoc();
			doc.keys[knownHostKey(host, port)] = {
				fingerprint: normalized,
				algorithm: "SHA256",
				trustedAt: Date.now()
			};
			await this.writeJson(this.knownHostsPath, doc);
		});
	}
};
// src/host/api.ts
const MAX_JSON_BODY_BYTES = 262144;
function asRecord(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw remoteError("bad_request", "请求体必须是 JSON 对象。");
	return value;
}
function requireId(value) {
	if (typeof value !== "string" || value.trim() === "") throw remoteError("bad_request", "缺少服务器 id。");
	return value.trim();
}
function optionalString(value) {
	return typeof value === "string" ? value : void 0;
}
function asBoolean(value) {
	return value === true;
}
/** Read a bounded JSON request body. */
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		total += buffer.length;
		if (total > MAX_JSON_BODY_BYTES) throw remoteError("bad_request", "请求体过大。");
		chunks.push(buffer);
	}
	if (total === 0) return {};
	try {
		return asRecord(JSON.parse(Buffer.concat(chunks).toString("utf8")));
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "bad_request") throw error;
		throw remoteError("bad_request", "请求体不是有效的 JSON。");
	}
}
var ServerDirectoryApi = class {
	store;
	pool;
	constructor(deps) {
		this.store = deps.store;
		this.pool = deps.pool;
	}
	async call(method, body) {
		switch (method) {
			case "listServers": return this.listServers();
			case "saveServer": return this.saveServer(body);
			case "deleteServer": return this.deleteServer(body);
			case "connect": return this.connect(body);
			case "disconnect": return this.disconnect(body);
			case "status": return { statuses: this.pool.listStatuses() };
			case "list": return this.list(body);
			case "stat": return this.stat(body);
			case "mkdir": return this.mkdir(body);
			case "rename": return this.rename(body);
			case "delete": return this.delete(body);
			default: throw remoteError("not_found", `未知操作：${method}`);
		}
	}
	async requireServer(id) {
		const server = await this.store.getServer(id);
		if (!server) throw remoteError("not_found", "服务器不存在。");
		return server;
	}
	async listServers() {
		const servers = await this.store.listServers();
		const statuses = new Map(this.pool.listStatuses().map((status) => [status.serverId, status]));
		return { servers: await Promise.all(servers.map(async (server) => ({
			...toPublicServer(server, await this.store.hasPassword(server.id)),
			connection: statuses.get(server.id) ?? {
				serverId: server.id,
				state: "disconnected"
			}
		}))) };
	}
	async saveServer(body) {
		const raw = asRecord(body.server);
		const id = optionalString(raw.id)?.trim();
		const existing = id ? await this.store.getServer(id) : void 0;
		const protocolValue = raw.protocol;
		if (!isServerProtocol(protocolValue)) throw remoteError("bad_request", "不支持的连接协议。");
		const port = Number(raw.port);
		if (!Number.isInteger(port) || port < 1 || port > 65535) throw remoteError("bad_request", "端口必须是 1–65535 的整数。");
		const password = optionalString(raw.password);
		if (!existing && (!password || password === "")) throw remoteError("bad_request", "密码不能为空。");
		const input = {
			id: existing?.id,
			name: optionalString(raw.name),
			protocol: protocolValue,
			host: optionalString(raw.host) ?? "",
			port,
			username: optionalString(raw.username) ?? "",
			password,
			allowInvalidCert: asBoolean(raw.allowInvalidCert)
		};
		const record = await this.store.saveServer(input);
		if (!existing || existing.protocol !== record.protocol || existing.host !== record.host || existing.port !== record.port || existing.username !== record.username || existing.allowInvalidCert !== record.allowInvalidCert || typeof password === "string" && password !== "") try {
			await this.pool.disconnect(record.id);
		} catch {}
		return { server: toPublicServer(record, await this.store.hasPassword(record.id)) };
	}
	async deleteServer(body) {
		const id = requireId(body.id);
		await this.pool.disconnect(id);
		return { deleted: (await this.store.deleteServer(id)).deleted };
	}
	async connect(body) {
		const id = requireId(body.id);
		await this.requireServer(id);
		const result = await this.pool.connect(id, {
			trustHostKey: asBoolean(body.trustHostKey),
			hostKeyFingerprint: optionalString(body.hostKeyFingerprint),
			acceptChangedHostKey: asBoolean(body.acceptChangedHostKey)
		});
		return {
			home: result.home,
			fingerprint: result.fingerprint,
			status: result.status
		};
	}
	async disconnect(body) {
		const id = requireId(body.id);
		await this.pool.disconnect(id);
		return { ok: true };
	}
	async list(body) {
		const id = requireId(body.id);
		await this.requireServer(id);
		return this.pool.withSession(id, async (adapter, home) => {
			const path = assertSafeRemotePath(resolveRemotePath(optionalString(body.path), home));
			const listing = await adapter.list(path);
			return {
				path,
				home,
				entries: listing.entries,
				truncated: listing.truncated
			};
		});
	}
	async stat(body) {
		const id = requireId(body.id);
		await this.requireServer(id);
		return this.pool.withSession(id, async (adapter, home) => {
			const path = assertSafeRemotePath(resolveRemotePath(optionalString(body.path), home));
			return { stat: await adapter.stat(path) };
		});
	}
	async mkdir(body) {
		const id = requireId(body.id);
		const name = sanitizeRemoteName(body.name);
		await this.requireServer(id);
		return this.pool.withSession(id, async (adapter, home) => {
			const target = joinRemotePath(assertSafeRemotePath(resolveRemotePath(optionalString(body.parent), home)), name);
			await adapter.mkdir(target);
			return { path: target };
		});
	}
	async rename(body) {
		const id = requireId(body.id);
		const newName = sanitizeRemoteName(body.newName);
		await this.requireServer(id);
		return this.pool.withSession(id, async (adapter, home) => {
			const from = assertSafeRemotePath(resolveRemotePath(optionalString(body.path), home));
			if (from === "/") throw remoteError("bad_request", "不能重命名远端根目录。");
			const to = joinRemotePath(parentRemotePath(from), newName);
			await adapter.rename(from, to);
			return { path: to };
		});
	}
	async delete(body) {
		const id = requireId(body.id);
		await this.requireServer(id);
		return this.pool.withSession(id, async (adapter, home) => {
			const path = assertDeletableRemotePath(resolveRemotePath(optionalString(body.path), home));
			await adapter.removeTree(path);
			return { path };
		});
	}
	/** Consume the raw upload request body and stream it to the remote file. */
	async upload(req, query) {
		const id = requireId(query.get("serverId") ?? void 0);
		const name = sanitizeRemoteName(query.get("name") ?? "");
		const overwrite = query.get("overwrite") === "1" || query.get("overwrite") === "true";
		const directoryInput = query.get("dir") ?? void 0;
		await this.requireServer(id);
		return this.pool.withSession(id, async (adapter, home) => {
			const directory = assertSafeRemotePath(resolveRemotePath(directoryInput, home));
			return { path: await adapter.upload(req, directory, name, overwrite) };
		});
	}
	/** Stream a remote file into an HTTP response. */
	async download(query, res) {
		const id = requireId(query.get("serverId") ?? void 0);
		const pathInput = query.get("path") ?? void 0;
		await this.requireServer(id);
		await this.pool.withSession(id, async (adapter, home) => {
			const path = assertSafeRemotePath(resolveRemotePath(pathInput, home));
			const stat = await adapter.stat(path);
			if (stat.kind === "directory") throw remoteError("bad_request", "不能下载目录。");
			const name = remoteBaseName(path) || "download";
			const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "download";
			res.writeHead(200, {
				"content-type": "application/octet-stream",
				"content-length": String(stat.size),
				"content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
				"cache-control": "no-store",
				"x-content-type-options": "nosniff",
				"referrer-policy": "no-referrer"
			});
			await adapter.download(path, res);
			if (!res.writableEnded) res.end();
		});
	}
};
// src/host/protocols/common.ts
const LIST_LIMIT = 5e3;
/** Sort directory entries: directories first, then case-insensitive name. */
function sortEntries(entries) {
	return entries.sort((left, right) => {
		const leftDir = left.kind === "directory" ? 0 : 1;
		const rightDir = right.kind === "directory" ? 0 : 1;
		if (leftDir !== rightDir) return leftDir - rightDir;
		return left.name.localeCompare(right.name, void 0, {
			numeric: true,
			sensitivity: "base"
		});
	});
}
/** Cap a listing while still telling the client it was cut. */
function capEntries(entries) {
	const sorted = sortEntries(entries);
	if (sorted.length <= 5e3) return {
		entries: sorted,
		truncated: false
	};
	return {
		entries: sorted.slice(0, LIST_LIMIT),
		truncated: true
	};
}
function remoteChild(parent, name) {
	return posix.join(parent, name);
}
function kindFromMode(mode) {
	const type = mode & 61440;
	if (type === 16384) return "directory";
	if (type === 32768) return "file";
	if (type === 40960) return "symlink";
	return "other";
}
function normalizedMtime(value) {
	if (value instanceof Date) return value.getTime();
	if (typeof value === "number" && Number.isFinite(value)) return value > 1e10 ? value : value * 1e3;
	return 0;
}
// src/host/protocols/host-key.ts
function normalizeFingerprint(value) {
	return String(value ?? "").trim().replace(/^SHA256:/i, "").toLowerCase();
}
/**
* Pure SFTP host-key policy:
* - known + matching => accept without prompting;
* - unknown => accept only with explicit trust AND the fingerprint the user saw;
* - changed => additionally require explicit acceptance of the change.
*
* The expected fingerprint comparison closes the TOCTOU window between the
* prompt and the second connection attempt.
*/
function decideHostKey(hashedKey, policy) {
	const actual = normalizeFingerprint(hashedKey);
	if (!/^[a-f0-9]{64}$/.test(actual)) return {
		fingerprint: actual,
		accepted: false,
		error: remoteError("internal", "服务器返回了无法识别的主机密钥指纹。")
	};
	const known = policy.knownFingerprint ? normalizeFingerprint(policy.knownFingerprint) : "";
	const expected = policy.expectedFingerprint ? normalizeFingerprint(policy.expectedFingerprint) : "";
	if (known === "") {
		if (policy.trust && expected === actual) return {
			fingerprint: actual,
			accepted: true
		};
		return {
			fingerprint: actual,
			accepted: false,
			error: remoteError("unknown_host_key", "首次连接该服务器，需要确认主机指纹。", {
				fingerprint: actual,
				algorithm: "SHA256"
			})
		};
	}
	if (known === actual) return {
		fingerprint: actual,
		accepted: true
	};
	if (policy.trust && policy.acceptChanged && expected === actual) return {
		fingerprint: actual,
		accepted: true
	};
	return {
		fingerprint: actual,
		accepted: false,
		error: remoteError("host_key_changed", "服务器主机密钥已变化，必须明确确认新指纹后才能连接。", {
			fingerprint: actual,
			previous: known,
			algorithm: "SHA256"
		})
	};
}
// src/host/protocols/sftp.ts
/**
* SFTP adapter over ssh2.
*
* Password authentication is primary; keyboard-interactive is offered as a
* fallback because several SSH servers use it for password login. Host keys
* are always verified: an unknown key must be explicitly trusted by the user,
* and a changed key is never accepted silently.
*/
const CONNECT_TIMEOUT_MS$1 = 25e3;
const OPERATION_TIMEOUT_MS = 3e4;
function callSftp(action, timeoutMs = OPERATION_TIMEOUT_MS) {
	return new Promise((resolve, reject) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			reject(remoteError("timeout", "远端操作超时。"));
		}, timeoutMs);
		const finish = (error, value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (error) reject(mapError(error, "internal"));
			else resolve(value);
		};
		try {
			action(finish);
		} catch (error) {
			finish(error instanceof Error ? error : new Error(String(error)), void 0);
		}
	});
}
function statKind(stats) {
	if (stats.isDirectory()) return "directory";
	if (stats.isFile()) return "file";
	if (stats.isSymbolicLink()) return "symlink";
	if (typeof stats.mode === "number") return kindFromMode(stats.mode);
	return "other";
}
var SftpAdapter = class {
	protocol = "sftp";
	config;
	client;
	sftp;
	homePath = "/";
	fingerprint = "";
	connected = false;
	/** Incremented per connect attempt so late events from an abandoned client
	* cannot clobber a newer live connection. */
	generation = 0;
	constructor(config) {
		this.config = config;
	}
	isConnected() {
		return this.connected && this.sftp !== void 0;
	}
	home() {
		return this.homePath;
	}
	async connect(policy) {
		if (this.connected) return {
			home: this.homePath,
			fingerprint: this.fingerprint || void 0
		};
		const server = this.config.server;
		let hostKeyFailure;
		let resolved = false;
		const generation = ++this.generation;
		const client = new Client();
		this.client = client;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				if (resolved) return;
				resolved = true;
				try {
					client.end();
				} catch {}
				reject(remoteError("timeout", "连接 SSH 服务器超时。"));
			}, CONNECT_TIMEOUT_MS$1);
			const fail = (error) => {
				if (resolved) return;
				resolved = true;
				clearTimeout(timer);
				if (this.generation === generation) {
					this.connected = false;
					this.sftp = void 0;
				}
				try {
					client.end();
				} catch {}
				reject(hostKeyFailure ?? mapError(error, "connection_failed"));
			};
			client.on("keyboard-interactive", (_name, _instructions, _lang, prompts, finish) => {
				finish(prompts.map(() => this.config.password));
			});
			client.on("ready", () => {
				const current = client;
				if (this.generation !== generation) {
					try {
						current.end();
					} catch {}
					return;
				}
				current.sftp((error, sftp) => {
					if (resolved || this.generation !== generation) {
						try {
							current.end();
						} catch {}
						return;
					}
					if (error || !sftp) {
						fail(error ?? /* @__PURE__ */ new Error("SFTP subsystem unavailable"));
						return;
					}
					this.sftp = sftp;
					this.connected = true;
					const done = (home) => {
						if (resolved) return;
						resolved = true;
						clearTimeout(timer);
						this.homePath = home || "/";
						resolve({
							home: this.homePath,
							fingerprint: this.fingerprint || void 0
						});
					};
					sftp.realpath(".", (realpathError, absolute) => {
						if (realpathError) {
							done("/");
							return;
						}
						done(absolute || "/");
					});
				});
			});
			client.on("error", (error) => {
				const message = sanitizeMessage(error.message);
				if (this.generation === generation) {
					this.connected = false;
					this.sftp = void 0;
				}
				fail(new Error(message));
			});
			client.on("close", () => {
				if (this.generation === generation) {
					this.connected = false;
					this.sftp = void 0;
				}
				if (!resolved) fail(/* @__PURE__ */ new Error("SSH connection closed before authentication completed"));
			});
			const verifyHost = (value) => {
				const decision = decideHostKey(value, policy);
				this.fingerprint = decision.fingerprint;
				if (!decision.accepted) hostKeyFailure = decision.error;
				return decision.accepted;
			};
			const options = {
				host: server.host,
				port: server.port,
				username: server.username,
				password: this.config.password,
				readyTimeout: 2e4,
				keepaliveInterval: 3e4,
				keepaliveCountMax: 3,
				tryKeyboard: true,
				hostHash: "sha256",
				hostVerifier: verifyHost
			};
			try {
				client.connect(options);
			} catch (error) {
				fail(error);
			}
		});
	}
	requireSftp() {
		if (!this.connected || !this.sftp) throw remoteError("not_connected", "未连接到服务器。");
		return this.sftp;
	}
	async list(path) {
		const sftp = this.requireSftp();
		const entries = [];
		const list = await callSftp((callback) => sftp.readdir(path, callback));
		for (const item of list) {
			if (item.filename === "." || item.filename === "..") continue;
			const full = remoteChild(path, item.filename);
			let kind = statKind(item.attrs);
			let isSymlink = item.attrs.isSymbolicLink();
			if (isSymlink) try {
				kind = statKind(await callSftp((callback) => sftp.stat(full, callback), 1e4));
				isSymlink = true;
			} catch {
				kind = "symlink";
			}
			entries.push({
				name: item.filename,
				path: full,
				kind,
				isSymlink,
				size: Number(item.attrs.size) || 0,
				mtime: normalizedMtime(item.attrs.mtime)
			});
		}
		return capEntries(entries);
	}
	async stat(path) {
		const sftp = this.requireSftp();
		const stats = await callSftp((callback) => sftp.stat(path, callback));
		return {
			path,
			name: posix.basename(path) || "/",
			kind: statKind(stats),
			isSymlink: stats.isSymbolicLink(),
			size: Number(stats.size) || 0,
			mtime: normalizedMtime(stats.mtime)
		};
	}
	async mkdir(path) {
		const sftp = this.requireSftp();
		await callSftp((callback) => sftp.mkdir(path, callback));
	}
	async rename(from, to) {
		const sftp = this.requireSftp();
		await callSftp((callback) => sftp.rename(from, to, callback));
	}
	async removeTree(path) {
		const sftp = this.requireSftp();
		let nodes = 0;
		const remove = async (target, depth) => {
			if (depth > 100) throw remoteError("bad_request", "目录层级过深，已停止删除。");
			nodes += 1;
			if (nodes > 1e4) throw remoteError("bad_request", "目录条目过多，已停止删除。");
			const stats = await callSftp((callback) => sftp.lstat(target, callback));
			if (stats.isDirectory() && !stats.isSymbolicLink()) {
				const items = await callSftp((callback) => sftp.readdir(target, callback));
				for (const item of items) {
					if (item.filename === "." || item.filename === "..") continue;
					await remove(remoteChild(target, item.filename), depth + 1);
				}
				await callSftp((callback) => sftp.rmdir(target, callback));
				return;
			}
			await callSftp((callback) => sftp.unlink(target, callback));
		};
		await remove(path, 0);
	}
	async upload(source, directory, name, overwrite) {
		const sftp = this.requireSftp();
		const target = remoteChild(directory, name);
		let existing;
		try {
			existing = await this.stat(target);
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "not_found")) throw error;
		}
		if (existing?.kind === "directory") throw remoteError("conflict", "同名目录已存在。");
		if (existing && !overwrite) throw remoteError("conflict", "目标文件已存在。");
		const temp = remoteChild(directory, `.${name.length > 160 ? name.slice(0, 160) : name}.dsh-upload-${randomUUID().slice(0, 8)}`);
		let writeStream;
		try {
			writeStream = sftp.createWriteStream(temp);
			await pipeline(source, writeStream);
			writeStream = void 0;
			if (existing) try {
				await callSftp((callback) => sftp.unlink(target, callback));
			} catch {}
			await callSftp((callback) => sftp.rename(temp, target, callback));
			return target;
		} catch (error) {
			try {
				writeStream?.destroy();
			} catch {}
			try {
				await callSftp((callback) => sftp.unlink(temp, callback), 5e3);
			} catch {}
			throw mapError(error, "internal");
		}
	}
	async download(path, destination) {
		const source = this.requireSftp().createReadStream(path);
		await pipeline(source, destination);
	}
	async close() {
		this.generation += 1;
		this.connected = false;
		this.sftp = void 0;
		const client = this.client;
		this.client = void 0;
		if (!client) return;
		try {
			client.end();
		} catch {}
	}
};
// src/host/protocols/ftp.ts
/**
* FTP / FTPS adapter over basic-ftp.
*
* basic-ftp's built-in recursive removeDir is deliberately not used: the
* plugin owns recursive deletion so it can avoid following symlinks and can
* keep its own safety budget. All operations on one connection are serialized
* by the connection pool.
*/
const CONNECT_TIMEOUT_MS = 25e3;
function mapFtpError(error) {
	const code = error?.code;
	if (typeof code === "number") {
		if (code === 530) return remoteError("auth_failed", "账号或密码错误。");
		if (code === 421) return remoteError("timeout", "FTP 服务器关闭了连接。");
		if (code === 550) return remoteError("permission_denied", "FTP 服务器拒绝访问该路径（不存在或无权限）。");
		if (code === 553) return remoteError("bad_request", "FTP 服务器拒绝了文件名。");
		if (code === 425) return remoteError("connection_failed", "FTP 无法建立数据传输连接。");
	}
	const message = sanitizeMessage(error?.message ?? String(error));
	if (/self[- ]signed|certificate|tls|ssl/i.test(message)) return remoteError("tls_error", "TLS 证书校验失败；仅在信任该服务器时允许自签名证书。");
	if (/login|password|530/i.test(message)) return remoteError("auth_failed", "账号或密码错误。");
	return mapError(error, "connection_failed");
}
function isTimeout(error) {
	const code = error?.code;
	if (code === 421 || code === "ETIMEDOUT") return true;
	const message = String(error?.message ?? "");
	return /timeout|timed out/i.test(message);
}
function kindOf(info) {
	if (info.type === FileType.Directory) return "directory";
	if (info.type === FileType.File) return "file";
	if (info.type === FileType.SymbolicLink) return "symlink";
	if (info.isDirectory) return "directory";
	if (info.isFile) return "file";
	if (info.isSymbolicLink) return "symlink";
	return "other";
}
var FtpAdapter = class {
	protocol;
	config;
	client;
	homePath = "/";
	connected = false;
	constructor(config) {
		this.config = config;
		this.protocol = config.server.protocol === "sftp" ? "ftp" : config.server.protocol;
	}
	isConnected() {
		return this.connected && this.client !== void 0 && !this.client.closed;
	}
	home() {
		return this.homePath;
	}
	async connect(_policy) {
		if (this.isConnected()) return { home: this.homePath };
		await this.openClient(true);
		return { home: this.homePath };
	}
	async openClient(retryOnTimeout) {
		await this.close();
		const server = this.config.server;
		const client = new Client$1(CONNECT_TIMEOUT_MS);
		this.client = client;
		const secure = server.protocol === "ftpsi" ? "implicit" : server.protocol === "ftps" ? true : false;
		try {
			await client.access({
				host: server.host,
				port: server.port,
				user: server.username,
				password: this.config.password,
				secure,
				...secure && server.allowInvalidCert ? { secureOptions: { rejectUnauthorized: false } } : {}
			});
			this.homePath = await client.pwd() || "/";
			this.connected = true;
		} catch (error) {
			this.connected = false;
			try {
				client.close();
			} catch {}
			this.client = void 0;
			if (retryOnTimeout && isTimeout(error)) return this.openClient(false);
			throw mapFtpError(error);
		}
	}
	requireClient() {
		if (!this.isConnected() || !this.client) throw remoteError("not_connected", "未连接到 FTP 服务器。");
		return this.client;
	}
	async readWithRetry(operation) {
		try {
			return await operation(this.requireClient());
		} catch (error) {
			if (this.client?.closed) try {
				await this.openClient(false);
				return await operation(this.requireClient());
			} catch (retryError) {
				throw mapFtpError(retryError);
			}
			throw mapFtpError(error);
		}
	}
	async write(operation) {
		try {
			return await operation(this.requireClient());
		} catch (error) {
			throw mapFtpError(error);
		}
	}
	async list(path) {
		return capEntries((await this.readWithRetry((client) => client.list(path))).filter((info) => info.name !== "." && info.name !== "..").map((info) => {
			const kind = kindOf(info);
			return {
				name: info.name,
				path: remoteChild(path, info.name),
				kind,
				isSymlink: info.isSymbolicLink || kind === "symlink",
				size: Number(info.size) || 0,
				mtime: normalizedMtime(info.modifiedAt)
			};
		}));
	}
	async stat(path) {
		if (path === "/") return {
			path,
			name: "/",
			kind: "directory",
			isSymlink: false,
			size: 0,
			mtime: 0
		};
		const parent = posix.dirname(path);
		const name = posix.basename(path);
		const entry = (await this.list(parent)).entries.find((item) => item.name === name);
		if (!entry) throw remoteError("not_found", "远端路径不存在。");
		if (entry.kind === "symlink") try {
			const size = await this.readWithRetry((client) => client.size(path));
			return {
				...entry,
				kind: "file",
				isSymlink: true,
				size
			};
		} catch {
			return entry;
		}
		return {
			path: entry.path,
			name: entry.name,
			kind: entry.kind,
			isSymlink: entry.isSymlink,
			size: entry.size,
			mtime: entry.mtime
		};
	}
	async mkdir(path) {
		await this.write(async (client) => {
			await client.send(`MKD ${path}`);
		});
	}
	async rename(from, to) {
		await this.write((client) => client.rename(from, to).then(() => void 0));
	}
	async removeTree(path) {
		let nodes = 0;
		const remove = async (target, depth) => {
			if (depth > 100) throw remoteError("bad_request", "目录层级过深，已停止删除。");
			nodes += 1;
			if (nodes > 1e4) throw remoteError("bad_request", "目录条目过多，已停止删除。");
			const info = await this.stat(target);
			if (info.kind === "directory" && !info.isSymlink) {
				const listing = await this.list(target);
				for (const child of listing.entries) await remove(child.path, depth + 1);
				await this.write(async (client) => {
					await client.send(`RMD ${target}`);
				});
				return;
			}
			await this.write((client) => client.remove(target).then(() => void 0));
		};
		await remove(path, 0);
	}
	async upload(source, directory, name, overwrite) {
		const target = remoteChild(directory, name);
		let existing;
		try {
			existing = await this.stat(target);
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "not_found")) throw error;
		}
		if (existing?.kind === "directory") throw remoteError("conflict", "同名目录已存在。");
		if (existing && !overwrite) throw remoteError("conflict", "目标文件已存在。");
		const temp = remoteChild(directory, `.${name.length > 160 ? name.slice(0, 160) : name}.dsh-upload-${randomUUID().slice(0, 8)}`);
		try {
			await this.write((client) => client.uploadFrom(source, temp).then(() => void 0));
			if (existing) await this.write((client) => client.remove(target).then(() => void 0));
			await this.write((client) => client.rename(temp, target).then(() => void 0));
			return target;
		} catch (error) {
			try {
				await this.write((client) => client.remove(temp).then(() => void 0));
			} catch {}
			throw mapError(error, "internal");
		}
	}
	async download(path, destination) {
		await this.write((client) => client.downloadTo(destination, path).then(() => void 0));
	}
	async close() {
		this.connected = false;
		const client = this.client;
		this.client = void 0;
		if (!client) return;
		try {
			client.close();
		} catch {}
	}
};
// src/host/pool.ts
/**
* Per-server connection pool. Each server has at most one live protocol
* adapter, and all operations on that adapter are serialized so FTP command
* interleaving cannot corrupt listings or transfers.
*/
var ConnectionPool = class {
	store;
	sessions = /* @__PURE__ */ new Map();
	queues = /* @__PURE__ */ new Map();
	errors = /* @__PURE__ */ new Map();
	connectChain = Promise.resolve();
	constructor(store) {
		this.store = store;
	}
	createAdapter(server, password) {
		if (server.protocol === "sftp") return new SftpAdapter({
			server,
			password
		});
		return new FtpAdapter({
			server,
			password
		});
	}
	/** Connect (or reuse) a server; connection attempts are serialized globally. */
	async connect(serverId, options = {}) {
		const run = this.connectChain.then(() => this.connectNow(serverId, options), () => this.connectNow(serverId, options));
		this.connectChain = run.catch(() => void 0);
		return run;
	}
	async connectNow(serverId, options) {
		const existing = this.sessions.get(serverId);
		if (existing?.adapter.isConnected()) return {
			home: existing.home,
			fingerprint: existing.fingerprint,
			status: this.statusOf(existing)
		};
		if (existing) await this.disconnect(serverId);
		const server = await this.store.getServer(serverId);
		if (!server) throw remoteError("not_found", "服务器不存在。");
		const password = await this.store.getPassword(serverId);
		if (!password) throw remoteError("auth_failed", "该服务器尚未保存密码，请编辑服务器并填写密码。");
		const known = server.protocol === "sftp" ? await this.store.getKnownHost(server.host, server.port) : void 0;
		const adapter = this.createAdapter(server, password);
		try {
			const result = await adapter.connect({
				knownFingerprint: known?.fingerprint,
				trust: options.trustHostKey === true,
				expectedFingerprint: options.hostKeyFingerprint,
				acceptChanged: options.acceptChangedHostKey === true
			});
			if (server.protocol === "sftp" && result.fingerprint && options.trustHostKey === true) await this.store.trustHost(server.host, server.port, result.fingerprint);
			const session = {
				server,
				adapter,
				home: result.home || "/",
				fingerprint: result.fingerprint,
				lastUsedAt: Date.now()
			};
			this.sessions.set(serverId, session);
			this.errors.delete(serverId);
			return {
				home: session.home,
				fingerprint: session.fingerprint,
				status: this.statusOf(session)
			};
		} catch (error) {
			try {
				await adapter.close();
			} catch {}
			const mapped = mapError(error, "connection_failed");
			this.errors.set(serverId, {
				code: mapped.code,
				message: mapped.message
			});
			throw mapped;
		}
	}
	async disconnect(serverId) {
		const session = this.sessions.get(serverId);
		this.sessions.delete(serverId);
		this.errors.delete(serverId);
		if (session) try {
			await session.adapter.close();
		} catch {}
	}
	getHome(serverId) {
		return this.sessions.get(serverId)?.home;
	}
	isConnected(serverId) {
		return this.sessions.get(serverId)?.adapter.isConnected() === true;
	}
	statusOfSession(serverId) {
		const session = this.sessions.get(serverId);
		if (session) return this.statusOf(session);
		const error = this.errors.get(serverId);
		if (error) return {
			serverId,
			state: "error",
			code: error.code,
			lastError: error.message
		};
		return {
			serverId,
			state: "disconnected"
		};
	}
	listStatuses() {
		return [.../* @__PURE__ */ new Set([...this.sessions.keys(), ...this.errors.keys()])].map((id) => this.statusOfSession(id));
	}
	statusOf(session) {
		if (!session.adapter.isConnected()) return {
			serverId: session.server.id,
			state: "disconnected"
		};
		return {
			serverId: session.server.id,
			state: "connected",
			home: session.home
		};
	}
	enqueue(serverId, operation) {
		const run = (this.queues.get(serverId) ?? Promise.resolve()).then(operation, operation);
		this.queues.set(serverId, run.then(() => void 0, () => void 0));
		return run;
	}
	/** Run one operation against a live server. */
	async withSession(serverId, operation) {
		return this.enqueue(serverId, async () => {
			let session = this.sessions.get(serverId);
			if (!session || !session.adapter.isConnected()) {
				if (session) {
					this.sessions.delete(serverId);
					this.errors.set(serverId, {
						code: "disconnected",
						message: "连接已断开，请重新连接。"
					});
					try {
						await session.adapter.close();
					} catch {}
				}
				throw remoteError("not_connected", "连接已断开，请重新连接。");
			}
			session.lastUsedAt = Date.now();
			try {
				return await operation(session.adapter, session.home);
			} catch (error) {
				const mapped = mapError(error);
				if (mapped.code === "not_connected" || mapped.code === "disconnected") {
					this.sessions.delete(serverId);
					this.errors.set(serverId, {
						code: mapped.code,
						message: mapped.message
					});
					try {
						await session.adapter.close();
					} catch {}
					session = void 0;
				}
				throw mapped;
			}
		});
	}
	async closeAll() {
		const ids = [...this.sessions.keys()];
		await Promise.all(ids.map((id) => this.disconnect(id)));
	}
};
// src/index.ts
const name = "dsh-server-directory";
const inject = ["webServer"];
const ROUTE_PREFIX = "/dsh-server-directory";
const API_ROOT = `${ROUTE_PREFIX}/api`;
const API_PREFIX = `${API_ROOT}/`;
function sendJson(res, status, payload) {
	if (res.headersSent) {
		res.destroy();
		return;
	}
	const body = JSON.stringify(payload);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff",
		"referrer-policy": "no-referrer"
	});
	res.end(body);
}
function sendFailure(res, error, logger) {
	const mapped = mapError(error);
	if (mapped.code === "internal") logger?.error?.("[dsh-server-directory] request failed", error);
	else logger?.warn?.(`[dsh-server-directory] ${mapped.code}: ${mapped.message}`);
	if (res.headersSent) {
		res.destroy();
		return;
	}
	sendJson(res, mapped.status, {
		ok: false,
		code: mapped.code,
		error: mapped.message,
		...mapped.details ? mapped.details : {}
	});
}
function isLoopback(address) {
	if (!address) return false;
	const value = address.toLowerCase();
	return value === "::1" || value === "127.0.0.1" || value.startsWith("127.") || value === "::ffff:127.0.0.1";
}
function isLoopbackHost(host) {
	if (!host) return false;
	const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
	return name === "localhost" || name === "127.0.0.1" || name === "::1";
}
/**
* DSH's connection service is the primary trust authority. When a composition
* has no connection service, this fallback accepts only loopback requests and
* rejects cross-origin browser requests.
*/
function createFence(ctx) {
	return (req) => {
		let connection;
		try {
			connection = ctx.get("connection", true);
		} catch {
			connection = void 0;
		}
		if (connection && typeof connection.requestRejection === "function") try {
			return connection.requestRejection(req) === void 0;
		} catch {
			return false;
		}
		if (!isLoopback(req.socket.remoteAddress)) return false;
		const hostHeader = typeof req.headers.host === "string" ? req.headers.host : void 0;
		if (hostHeader && !isLoopbackHost(hostHeader)) return false;
		const origin = typeof req.headers.origin === "string" ? req.headers.origin : void 0;
		if (origin) try {
			const parsed = new URL(origin);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:" && parsed.protocol !== "dsh-app:") return false;
			if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !isLoopbackHost(parsed.host)) return false;
		} catch {
			return false;
		}
		return true;
	};
}
function apply(ctx) {
	const logger = ctx.logger;
	const store = new ServerStore({
		dataDir: resolveDataDir(),
		logger
	});
	store.init().catch((error) => {
		logger?.error?.("[dsh-server-directory] cannot initialize data directory", error);
	});
	const pool = new ConnectionPool(store);
	const api = new ServerDirectoryApi({
		store,
		pool
	});
	const fence = createFence(ctx);
	ctx.effect(() => {
		const disposers = [];
		const register = (route) => {
			disposers.push(ctx.webServer.register(route));
		};
		register({
			kind: "prefix",
			path: API_ROOT,
			handler: async (req, res) => {
				if (!fence(req)) {
					sendJson(res, 403, {
						ok: false,
						code: "permission_denied",
						error: "forbidden"
					});
					return;
				}
				if (req.method !== "POST") {
					sendJson(res, 405, {
						ok: false,
						code: "bad_request",
						error: "method not allowed"
					});
					return;
				}
				const url = new URL(req.url ?? "/", "http://dsh.internal");
				if (!url.pathname.startsWith(API_PREFIX)) {
					sendJson(res, 404, {
						ok: false,
						code: "not_found",
						error: "not found"
					});
					return;
				}
				const method = url.pathname.slice(API_PREFIX.length);
				if (!method || method.includes("/")) {
					sendJson(res, 404, {
						ok: false,
						code: "not_found",
						error: "not found"
					});
					return;
				}
				try {
					const body = await readJsonBody(req);
					sendJson(res, 200, {
						ok: true,
						...await api.call(method, body)
					});
				} catch (error) {
					sendFailure(res, error, logger);
				}
			}
		});
		register({
			kind: "exact",
			path: `${ROUTE_PREFIX}/upload`,
			handler: async (req, res) => {
				if (!fence(req)) {
					sendJson(res, 403, {
						ok: false,
						code: "permission_denied",
						error: "forbidden"
					});
					return;
				}
				if (req.method !== "POST") {
					sendJson(res, 405, {
						ok: false,
						code: "bad_request",
						error: "method not allowed"
					});
					return;
				}
				const url = new URL(req.url ?? "/", "http://dsh.internal");
				try {
					sendJson(res, 200, {
						ok: true,
						...await api.upload(req, url.searchParams)
					});
				} catch (error) {
					sendFailure(res, error, logger);
				}
			}
		});
		register({
			kind: "exact",
			path: `${ROUTE_PREFIX}/download`,
			handler: async (req, res) => {
				if (!fence(req)) {
					sendJson(res, 403, {
						ok: false,
						code: "permission_denied",
						error: "forbidden"
					});
					return;
				}
				if (req.method !== "GET") {
					sendJson(res, 405, {
						ok: false,
						code: "bad_request",
						error: "method not allowed"
					});
					return;
				}
				const url = new URL(req.url ?? "/", "http://dsh.internal");
				try {
					await api.download(url.searchParams, res);
				} catch (error) {
					sendFailure(res, error, logger);
				}
			}
		});
		logger?.info?.(`[dsh-server-directory] mounted ${disposers.length} routes`);
		return () => {
			for (const dispose of disposers.splice(0)) try {
				dispose();
			} catch {}
		};
	}, "dsh-server-directory: routes");
	ctx.effect(() => () => {
		pool.closeAll();
	}, "dsh-server-directory: connections");
}
export { apply, inject, name };
