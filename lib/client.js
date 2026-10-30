window.__ModuleLoader__.load({
	id: "dsh-server-directory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		// src/client/api.ts
		const ROUTE_ROOT = "dsh-server-directory";
		/**
		* Resolve against the page base, not the origin root. This keeps the plugin
		* working behind reverse-proxy path prefixes and inside the desktop shell.
		*/
		function routeUrl(path) {
			const raw = typeof document !== "undefined" ? document.baseURI : "http://dsh.internal/";
			const base = new URL(raw, "http://dsh.internal/");
			base.search = "";
			base.hash = "";
			if (!base.pathname.endsWith("/")) base.pathname += "/";
			return new URL(path.replace(/^\/+/u, ""), base).href;
		}
		var ApiError = class extends Error {
			code;
			data;
			constructor(code, message, data) {
				super(message);
				this.name = "ApiError";
				this.code = code;
				this.data = data;
			}
		};
		async function parseResponse(response) {
			const text = await response.text();
			let data = {};
			if (text) try {
				data = JSON.parse(text);
			} catch {
				throw new ApiError("internal", `服务器返回了无法解析的响应（HTTP ${response.status}）。`, {});
			}
			if (!response.ok || data.ok === false) throw new ApiError(typeof data.code === "string" ? data.code : "internal", typeof data.error === "string" ? data.error : `请求失败（HTTP ${response.status}）`, data);
			return data;
		}
		async function post(method, body = {}) {
			let response;
			try {
				response = await fetch(routeUrl(`${ROUTE_ROOT}/api/${method}`), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
					cache: "no-store"
				});
			} catch (error) {
				throw new ApiError("connection_failed", error instanceof Error ? error.message : "无法连接 DSH 主机服务。", {});
			}
			return parseResponse(response);
		}
		const api = {
			async listServers() {
				const result = await post("listServers");
				return Array.isArray(result.servers) ? result.servers : [];
			},
			async saveServer(server) {
				return (await post("saveServer", { server })).server;
			},
			async deleteServer(id) {
				await post("deleteServer", { id });
			},
			async connect(id, options = {}) {
				return await post("connect", {
					id,
					...options
				});
			},
			async disconnect(id) {
				await post("disconnect", { id });
			},
			async statuses() {
				const result = await post("status");
				return Array.isArray(result.statuses) ? result.statuses : [];
			},
			async list(id, path) {
				return await post("list", {
					id,
					path
				});
			},
			async stat(id, path) {
				return await post("stat", {
					id,
					path
				});
			},
			async mkdir(id, parent, name) {
				const result = await post("mkdir", {
					id,
					parent,
					name
				});
				return String(result.path ?? "");
			},
			async rename(id, path, newName) {
				const result = await post("rename", {
					id,
					path,
					newName
				});
				return String(result.path ?? "");
			},
			async remove(id, path) {
				await post("delete", {
					id,
					path
				});
			},
			downloadUrl(id, path) {
				const params = new URLSearchParams({
					serverId: id,
					path
				});
				return routeUrl(`${ROUTE_ROOT}/download?${params.toString()}`);
			}
		};
		/** Upload one file with progress. Rejects ApiError for a JSON failure. */
		function uploadFile(task) {
			return new Promise((resolve, reject) => {
				const params = new URLSearchParams({
					serverId: task.directory.serverId,
					dir: task.directory.path,
					name: task.file.name,
					overwrite: task.overwrite ? "1" : "0"
				});
				const xhr = new XMLHttpRequest();
				xhr.open("POST", routeUrl(`${ROUTE_ROOT}/upload?${params.toString()}`));
				xhr.responseType = "text";
				xhr.upload.onprogress = (event) => {
					if (event.lengthComputable) task.onProgress?.(event.loaded, event.total);
				};
				xhr.onerror = () => reject(new ApiError("connection_failed", "上传连接中断。", {}));
				xhr.onabort = () => reject(new DOMException("上传已取消", "AbortError"));
				xhr.onload = () => {
					let data = {};
					if (xhr.responseText) try {
						data = JSON.parse(xhr.responseText);
					} catch {
						reject(new ApiError("internal", `上传响应无法解析（HTTP ${xhr.status}）。`, {}));
						return;
					}
					if (xhr.status >= 200 && xhr.status < 300 && data.ok !== false) {
						resolve({ path: String(data.path ?? "") });
						return;
					}
					reject(new ApiError(typeof data.code === "string" ? data.code : "internal", typeof data.error === "string" ? data.error : `上传失败（HTTP ${xhr.status}）`, data));
				};
				const abort = () => xhr.abort();
				task.signal?.addEventListener("abort", abort, { once: true });
				xhr.onloadend = () => task.signal?.removeEventListener("abort", abort);
				xhr.send(task.file);
			});
		}
		// src/client/icons.tsx
		function svg(size, path, viewBox = "0 0 24 24") {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.8",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				focusable: "false",
				children: path
			});
		}
		function icon(draw) {
			return function Icon({ size = 16 }) {
				return draw(size);
			};
		}
		const ServerIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "3",
				y: "4",
				width: "18",
				height: "6",
				rx: "1.5"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "3",
				y: "14",
				width: "18",
				height: "6",
				rx: "1.5"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M7 7h.01M7 17h.01" }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M11 7h6M11 17h6" })
		] })));
		const FolderIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" })));
		const FileIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6 3h7l5 5v13H6z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M13 3v5h5" })] })));
		const LinkIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" })] })));
		const UnknownIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
			cx: "12",
			cy: "12",
			r: "9"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9.5 9a2.5 2.5 0 1 1 4 2c-.9.7-1.5 1.2-1.5 2.5M12 17h.01" })] })));
		const PlusIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 5v14M5 12h14" })));
		const RefreshIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M20 11a8 8 0 1 0-2.3 6.7" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M20 4v7h-7" })] })));
		const UpIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 19V5M6 11l6-6 6 6" })));
		const UploadIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 16V4M8 8l4-4 4 4" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" })] })));
		const DownloadIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 4v12M8 12l4 4 4-4" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 18v.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V18" })] })));
		const TrashIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10 11v5M14 11v5" })] })));
		const EditIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M13 6l4 4" })] })));
		const CloseIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6 6l12 12M18 6L6 18" })));
		const ChevronIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9 6l6 6-6 6" })));
		const SettingsIcon = icon((size) => svg(size, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
			cx: "12",
			cy: "12",
			r: "3"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.9v-4H3a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1z" })] })));
		// src/client/types.ts
		const PROTOCOL_LABELS = {
			sftp: "SFTP",
			ftp: "FTP",
			ftps: "FTPS（显式）",
			ftpsi: "FTPS（隐式）"
		};
		const PROTOCOL_PORTS = {
			sftp: 22,
			ftp: 21,
			ftps: 21,
			ftpsi: 990
		};
		// src/client/modals.tsx
		function Modal(props) {
			const { title, children, footer, onClose } = props;
			(0, react.useEffect)(() => {
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
				};
				document.addEventListener("keydown", onKey);
				return () => document.removeEventListener("keydown", onKey);
			}, [onClose]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsd-modal-layer",
				onMouseDown: (event) => {
					if (event.target === event.currentTarget) onClose();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsd-modal",
					style: props.wide ? { maxWidth: 460 } : void 0,
					role: "dialog",
					"aria-modal": "true",
					"aria-label": title,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsd-modal-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsd-modal-title",
								children: title
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsd-icon-btn",
								onClick: onClose,
								title: "关闭",
								type: "button",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CloseIcon, { size: 15 })
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsd-modal-body",
							children
						}),
						footer ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsd-modal-foot",
							children: footer
						}) : null
					]
				})
			});
		}
		function ErrorBox({ error }) {
			return error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dsd-error",
				style: {
					marginBottom: 9,
					border: "1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #d9534f) 25%, transparent)",
					borderRadius: 7
				},
				children: error
			}) : null;
		}
		function initialValues(server) {
			if (server) return {
				id: server.id,
				name: server.name,
				protocol: server.protocol,
				host: server.host,
				port: server.port,
				username: server.username,
				password: "",
				allowInvalidCert: server.allowInvalidCert
			};
			return {
				name: "",
				protocol: "sftp",
				host: "",
				port: 22,
				username: "",
				password: "",
				allowInvalidCert: false
			};
		}
		function ServerFormModal(props) {
			const [values, setValues] = (0, react.useState)(() => initialValues(props.server));
			const isEdit = props.server !== void 0;
			const patch = (update) => setValues((previous) => ({
				...previous,
				...update
			}));
			const changeProtocol = (protocol) => {
				const previousDefault = PROTOCOL_PORTS[values.protocol];
				const nextPort = values.port === previousDefault || !values.port ? PROTOCOL_PORTS[protocol] : values.port;
				setValues((previous) => ({
					...previous,
					protocol,
					port: nextPort,
					allowInvalidCert: protocol === "ftps" || protocol === "ftpsi" ? previous.allowInvalidCert : false
				}));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Modal, {
				title: isEdit ? "编辑服务器" : "添加服务器",
				onClose: props.onCancel,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "dsd-btn",
					type: "button",
					onClick: props.onCancel,
					disabled: props.busy,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "dsd-btn primary",
					type: "submit",
					form: "dsd-server-form",
					disabled: props.busy,
					children: props.busy ? "保存中…" : "保存"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					id: "dsd-server-form",
					onSubmit: (event) => {
						event.preventDefault();
						props.onSubmit({
							...values,
							name: values.name.trim(),
							host: values.host.trim(),
							username: values.username.trim(),
							port: Number(values.port)
						});
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ErrorBox, { error: props.error }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "dsd-field",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsd-label",
								children: "名称（可选）"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "dsd-input",
								value: values.name,
								placeholder: "例如：生产服务器",
								maxLength: 100,
								onChange: (event) => patch({ name: event.target.value }),
								autoFocus: true
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "dsd-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsd-label",
									children: "协议"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									className: "dsd-input",
									value: values.protocol,
									onChange: (event) => changeProtocol(event.target.value),
									children: Object.keys(PROTOCOL_LABELS).map((protocol) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: protocol,
										children: PROTOCOL_LABELS[protocol]
									}, protocol))
								}),
								values.protocol === "ftp" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dsd-warn",
									children: "明文 FTP：账号和文件内容不会被加密，建议改用 SFTP 或 FTPS。"
								}) : null
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "dsd-field",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsd-label",
								children: "服务器地址"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "dsd-input",
								value: values.host,
								placeholder: "example.com 或 192.168.1.10",
								autoCapitalize: "none",
								autoCorrect: "off",
								spellCheck: false,
								onChange: (event) => patch({ host: event.target.value }),
								required: true
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsd-field",
								style: { flex: 1 },
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsd-label",
									children: "端口"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dsd-input",
									type: "number",
									min: 1,
									max: 65535,
									value: values.port,
									onChange: (event) => patch({ port: Number(event.target.value) }),
									required: true
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsd-field",
								style: { flex: 1.5 },
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsd-label",
									children: "用户名"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dsd-input",
									value: values.username,
									autoComplete: "username",
									onChange: (event) => patch({ username: event.target.value }),
									required: true
								})]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "dsd-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsd-label",
									children: "密码"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "dsd-input",
									type: "password",
									value: values.password,
									autoComplete: "new-password",
									placeholder: isEdit ? "留空则保持原密码" : "服务器登录密码",
									onChange: (event) => patch({ password: event.target.value }),
									required: !isEdit
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dsd-hint",
									children: "密码只保存在 DSH 宿主机的本地文件中，不会回传给浏览器页面。"
								})
							]
						}),
						values.protocol === "ftps" || values.protocol === "ftpsi" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "dsd-check",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: values.allowInvalidCert,
								onChange: (event) => patch({ allowInvalidCert: event.target.checked })
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								"允许自签名/无效 TLS 证书",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsd-hint",
									children: "仅在明确信任该服务器时开启。"
								})
							] })]
						}) : null
					]
				})
			});
		}
		function ConfirmModal(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Modal, {
				title: props.title,
				onClose: props.onCancel,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "dsd-btn",
					type: "button",
					onClick: props.onCancel,
					disabled: props.busy,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: `dsd-btn ${props.danger ? "danger" : "primary"}`,
					type: "button",
					onClick: props.onConfirm,
					disabled: props.busy,
					children: props.busy ? "处理中…" : props.confirmLabel ?? "确定"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: 12.5,
						lineHeight: 1.65,
						whiteSpace: "pre-wrap"
					},
					children: props.message
				})
			});
		}
		function NameModal(props) {
			const [name, setName] = (0, react.useState)(props.initial ?? "");
			const inputRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				inputRef.current?.focus();
				inputRef.current?.select();
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Modal, {
				title: props.title,
				onClose: props.onCancel,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "dsd-btn",
					type: "button",
					onClick: props.onCancel,
					disabled: props.busy,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "dsd-btn primary",
					type: "submit",
					form: "dsd-name-form",
					disabled: props.busy,
					children: props.busy ? "处理中…" : props.confirmLabel ?? "确定"
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					id: "dsd-name-form",
					onSubmit: (event) => {
						event.preventDefault();
						const trimmed = name.trim();
						if (trimmed) props.onSubmit(trimmed);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ErrorBox, { error: props.error }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "dsd-field",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsd-label",
								children: props.label
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								ref: inputRef,
								className: "dsd-input",
								value: name,
								maxLength: 255,
								onChange: (event) => setName(event.target.value),
								required: true
							}),
							props.hint ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsd-hint",
								children: props.hint
							}) : null
						]
					})]
				})
			});
		}
		function displayFingerprint(fingerprint) {
			const value = fingerprint.replace(/^SHA256:/i, "");
			return `SHA256:${(value.match(/.{1,8}/g) ?? [value]).join(" ")}`;
		}
		function HostKeyModal(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Modal, {
				title: props.changed ? "主机密钥已变化" : "确认服务器主机密钥",
				onClose: props.onCancel,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "dsd-btn",
					type: "button",
					onClick: props.onCancel,
					disabled: props.busy,
					children: "取消"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "dsd-btn primary",
					type: "button",
					onClick: props.onConfirm,
					disabled: props.busy,
					children: props.busy ? "连接中…" : props.changed ? "更新信任并连接" : "信任并连接"
				})] }),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: 12.5,
							lineHeight: 1.65
						},
						children: props.changed ? "这台服务器的主机密钥与已保存的指纹不一致。可能服务器重装过，也可能存在中间人攻击。请通过其他可信渠道核对指纹后再继续。" : "这是第一次连接该服务器。请核对下面的 SHA256 指纹是否与服务器管理员提供的一致。"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsd-hint",
						children: props.endpoint
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsd-fingerprint",
						children: displayFingerprint(props.fingerprint)
					}),
					props.changed && props.previous ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsd-label",
						children: "原指纹"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsd-fingerprint",
						children: displayFingerprint(props.previous)
					})] }) : null
				]
			});
		}
		function ServerManagerModal(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Modal, {
				title: "服务器管理",
				wide: true,
				onClose: props.onClose,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "dsd-btn",
					type: "button",
					onClick: props.onClose,
					children: "关闭"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "dsd-btn primary",
					type: "button",
					onClick: props.onAdd,
					children: "添加服务器"
				})] }),
				children: props.servers.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsd-empty",
					style: { minHeight: 120 },
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsd-empty-icon",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ServerIcon, { size: 30 })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsd-empty-title",
							children: "还没有服务器"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsd-empty-desc",
							children: "支持 SFTP、FTP、显式 FTPS 和隐式 FTPS。"
						})
					]
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsd-server-list",
					children: props.servers.map((server) => {
						const state = server.connection?.state ?? "disconnected";
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: `dsd-server-item${server.id === props.activeId ? " active" : ""}`,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `dsd-dot${state === "connected" ? " on" : state === "error" ? " err" : ""}` }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "main",
									style: {
										border: 0,
										background: "transparent",
										textAlign: "left",
										padding: 0,
										cursor: "pointer",
										color: "inherit"
									},
									onClick: () => props.onSelect(server),
									title: "切换到此服务器",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "name",
											children: server.name || server.host
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "endpoint",
											children: [
												server.username,
												"@",
												server.host,
												":",
												server.port,
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "dsd-protocol-tag",
													style: { marginLeft: 5 },
													children: PROTOCOL_LABELS[server.protocol]
												})
											]
										}),
										state === "error" && server.connection?.lastError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "endpoint",
											style: { color: "var(--dsw-alias-state-error-primary, #d9534f)" },
											children: server.connection.lastError
										}) : null
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "actions",
									children: [
										state === "connected" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "dsd-btn subtle",
											type: "button",
											disabled: props.busy,
											onClick: () => props.onDisconnect(server),
											children: "断开"
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "dsd-btn subtle",
											type: "button",
											disabled: props.busy,
											onClick: () => props.onConnect(server),
											children: "连接"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "dsd-icon-btn",
											type: "button",
											title: "编辑",
											onClick: () => props.onEdit(server),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditIcon, { size: 14 })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "dsd-icon-btn danger",
											type: "button",
											title: "删除",
											onClick: () => props.onDelete(server),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrashIcon, { size: 14 })
										})
									]
								})
							]
						}, server.id);
					})
				})
			});
		}
		// src/client/Panel.tsx
		const ACTIVE_KEY = "dsh-server-directory:active";
		const PATHS_KEY = "dsh-server-directory:paths";
		function readStoredActive() {
			try {
				return localStorage.getItem(ACTIVE_KEY) || void 0;
			} catch {
				return;
			}
		}
		function persistActive(id) {
			try {
				if (id) localStorage.setItem(ACTIVE_KEY, id);
				else localStorage.removeItem(ACTIVE_KEY);
			} catch {}
		}
		function readStoredPaths() {
			try {
				const parsed = JSON.parse(localStorage.getItem(PATHS_KEY) ?? "{}");
				if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
				const result = {};
				for (const [key, value] of Object.entries(parsed)) if (typeof value === "string" && value.startsWith("/")) result[key] = value;
				return result;
			} catch {
				return {};
			}
		}
		function persistPaths(paths) {
			try {
				localStorage.setItem(PATHS_KEY, JSON.stringify(paths));
			} catch {}
		}
		function formatSize(bytes) {
			if (!Number.isFinite(bytes) || bytes <= 0) return bytes === 0 ? "0 B" : "";
			const units = [
				"B",
				"KB",
				"MB",
				"GB",
				"TB"
			];
			let value = bytes;
			let index = 0;
			while (value >= 1024 && index < units.length - 1) {
				value /= 1024;
				index += 1;
			}
			return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
		}
		function formatTime(mtime) {
			if (!mtime) return "";
			try {
				const date = new Date(mtime);
				if (date.getFullYear() === (/* @__PURE__ */ new Date()).getFullYear()) return date.toLocaleString("zh-CN", {
					month: "2-digit",
					day: "2-digit",
					hour: "2-digit",
					minute: "2-digit"
				});
				return date.toLocaleDateString("zh-CN", {
					year: "numeric",
					month: "2-digit",
					day: "2-digit"
				});
			} catch {
				return "";
			}
		}
		function errorText(error) {
			if (error instanceof Error && error.message) return error.message;
			return String(error);
		}
		function protocolLabel(server) {
			if (server.protocol === "sftp") return "SFTP";
			if (server.protocol === "ftp") return "FTP";
			if (server.protocol === "ftps") return "FTPS";
			return "FTPS (implicit)";
		}
		function endpointOf(server) {
			return `${server.username}@${server.host}:${server.port}`;
		}
		function joinRemote(directory, name) {
			return directory === "/" ? `/${name}` : `${directory.replace(/\/+$/u, "")}/${name}`;
		}
		function parentOf(path) {
			if (path === "/" || path === "") return "/";
			const index = path.replace(/\/+$/u, "").lastIndexOf("/");
			return index <= 0 ? "/" : path.slice(0, index);
		}
		function entryIcon(entry) {
			if (entry.kind === "directory") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FolderIcon, { size: 16 });
			if (entry.kind === "file") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileIcon, { size: 16 });
			if (entry.kind === "symlink") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LinkIcon, { size: 16 });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UnknownIcon, { size: 16 });
		}
		function hasFiles(event) {
			return Array.from(event.dataTransfer?.types ?? []).includes("Files");
		}
		function crumbsOf(path) {
			if (!path || path === "/") return [{
				label: "/",
				path: "/"
			}];
			const parts = path.split("/").filter(Boolean);
			const result = [{
				label: "/",
				path: "/"
			}];
			let current = "";
			for (const part of parts) {
				current += `/${part}`;
				result.push({
					label: part,
					path: current
				});
			}
			if (result.length > 6) return [
				result[0],
				{
					label: "…",
					path: result[result.length - 3].path
				},
				...result.slice(-3)
			];
			return result;
		}
		function mergeStatus(server, status) {
			return {
				...server,
				connection: status ?? {
					serverId: server.id,
					state: "disconnected"
				}
			};
		}
		function ServerDirectoryPanel({ visible }) {
			const [servers, setServers] = (0, react.useState)([]);
			const [activeId, setActiveId] = (0, react.useState)(readStoredActive);
			const [paths, setPaths] = (0, react.useState)(readStoredPaths);
			const [listing, setListing] = (0, react.useState)(null);
			const [currentPath, setCurrentPath] = (0, react.useState)("");
			const [loading, setLoading] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			const [selectedPath, setSelectedPath] = (0, react.useState)();
			const [modal, setModal] = (0, react.useState)(null);
			const [modalError, setModalError] = (0, react.useState)("");
			const [confirmRequest, setConfirmRequest] = (0, react.useState)(null);
			const [contextMenu, setContextMenu] = (0, react.useState)(null);
			const [editingPath, setEditingPath] = (0, react.useState)(false);
			const [pathDraft, setPathDraft] = (0, react.useState)("");
			const [uploads, setUploads] = (0, react.useState)([]);
			const [dragActive, setDragActive] = (0, react.useState)(false);
			const [dropTarget, setDropTarget] = (0, react.useState)(null);
			const activeIdRef = (0, react.useRef)(activeId);
			activeIdRef.current = activeId;
			const serversRef = (0, react.useRef)(servers);
			serversRef.current = servers;
			const currentPathRef = (0, react.useRef)(currentPath);
			currentPathRef.current = currentPath;
			const pathsRef = (0, react.useRef)(paths);
			pathsRef.current = paths;
			const loadSeq = (0, react.useRef)(0);
			const uploadSeq = (0, react.useRef)(0);
			const uploadControllers = (0, react.useRef)(/* @__PURE__ */ new Map());
			const dragDepth = (0, react.useRef)(0);
			const fileInputRef = (0, react.useRef)(null);
			const pendingUploadDir = (0, react.useRef)("");
			const contextRef = (0, react.useRef)(null);
			const activeServer = servers.find((server) => server.id === activeId);
			const activeState = activeServer?.connection?.state ?? "disconnected";
			const connected = activeState === "connected";
			const busyNow = busy !== "";
			const entries = listing?.entries ?? [];
			(0, react.useEffect)(() => {
				if (!notice) return void 0;
				const timer = setTimeout(() => setNotice(""), 3200);
				return () => clearTimeout(timer);
			}, [notice]);
			(0, react.useEffect)(() => {
				if (!contextMenu) return void 0;
				const close = (event) => {
					if (contextRef.current?.contains(event.target)) return;
					setContextMenu(null);
				};
				const onKey = (event) => {
					if (event.key === "Escape") setContextMenu(null);
				};
				const onScroll = () => setContextMenu(null);
				document.addEventListener("pointerdown", close);
				document.addEventListener("keydown", onKey);
				window.addEventListener("scroll", onScroll, true);
				return () => {
					document.removeEventListener("pointerdown", close);
					document.removeEventListener("keydown", onKey);
					window.removeEventListener("scroll", onScroll, true);
				};
			}, [contextMenu]);
			(0, react.useEffect)(() => {
				return () => {
					for (const controller of uploadControllers.current.values()) controller.abort();
					uploadControllers.current.clear();
				};
			}, []);
			const loadDirectoryFor = async (serverId, path) => {
				const seq = ++loadSeq.current;
				setLoading(true);
				setError("");
				try {
					const result = await api.list(serverId, path);
					if (seq !== loadSeq.current) return;
					setListing(result);
					setCurrentPath(result.path);
					setSelectedPath(void 0);
					const nextPaths = {
						...pathsRef.current,
						[serverId]: result.path
					};
					setPaths(nextPaths);
					persistPaths(nextPaths);
				} catch (loadError) {
					if (seq !== loadSeq.current) return;
					setError(errorText(loadError));
					if (loadError instanceof ApiError && (loadError.code === "not_connected" || loadError.code === "disconnected")) {
						setListing(null);
						try {
							const refreshed = await api.listServers();
							setServers(refreshed);
						} catch {}
					}
				} finally {
					if (seq === loadSeq.current) setLoading(false);
				}
			};
			const refreshServers = async () => {
				const refreshed = await api.listServers();
				setServers(refreshed);
				return refreshed;
			};
			(0, react.useEffect)(() => {
				if (!visible) return void 0;
				let cancelled = false;
				const boot = async () => {
					setError("");
					try {
						const refreshed = await api.listServers();
						if (cancelled) return;
						setServers(refreshed);
						let id = activeIdRef.current;
						if (!id || !refreshed.some((server) => server.id === id)) {
							id = refreshed[0]?.id;
							setActiveId(id);
							persistActive(id);
						}
						if (!id) {
							setListing(null);
							setCurrentPath("");
							return;
						}
						const server = refreshed.find((item) => item.id === id);
						if (server?.connection?.state === "connected") {
							const path = pathsRef.current[id] || server.connection.home || "/";
							await loadDirectoryFor(id, path);
						} else {
							setListing(null);
							setCurrentPath(pathsRef.current[id] ?? "");
						}
					} catch (bootError) {
						if (!cancelled) setError(errorText(bootError));
					}
				};
				boot();
				const timer = setInterval(() => {
					if (cancelled) return;
					api.statuses().then((statuses) => {
						if (cancelled) return;
						const map = new Map(statuses.map((status) => [status.serverId, status]));
						setServers((previous) => previous.map((server) => mergeStatus(server, map.get(server.id))));
					}).catch(() => {});
				}, 5e3);
				return () => {
					cancelled = true;
					clearInterval(timer);
					loadSeq.current += 1;
				};
			}, [visible]);
			const selectServer = (server) => {
				setActiveId(server.id);
				persistActive(server.id);
				setSelectedPath(void 0);
				setError("");
				setContextMenu(null);
				if (server.connection?.state === "connected") {
					const path = pathsRef.current[server.id] || server.connection.home || "/";
					setCurrentPath(path);
					loadDirectoryFor(server.id, path);
				} else {
					loadSeq.current += 1;
					setLoading(false);
					setListing(null);
					setCurrentPath(pathsRef.current[server.id] ?? "");
				}
			};
			const askConfirm = (options) => {
				return new Promise((resolve) => {
					setConfirmRequest({
						...options,
						resolve
					});
				});
			};
			const settleConfirm = (value) => {
				confirmRequest?.resolve(value);
				setConfirmRequest(null);
			};
			const connectServer = async (server, options = {}) => {
				setBusy(`connect:${server.id}`);
				setError("");
				try {
					const result = await api.connect(server.id, options);
					const refreshed = await refreshServers();
					setActiveId(server.id);
					persistActive(server.id);
					const nextPaths = {
						...pathsRef.current,
						[server.id]: result.home
					};
					setPaths(nextPaths);
					persistPaths(nextPaths);
					setCurrentPath(result.home);
					setModal(null);
					setModalError("");
					setNotice(`已连接 ${server.name || server.host}`);
					if (refreshed.some((item) => item.id === server.id)) await loadDirectoryFor(server.id, result.home);
				} catch (connectError) {
					if (connectError instanceof ApiError && (connectError.code === "unknown_host_key" || connectError.code === "host_key_changed")) {
						const fingerprint = typeof connectError.data.fingerprint === "string" ? connectError.data.fingerprint : "";
						if (fingerprint) {
							setModal({
								type: "hostkey",
								server,
								fingerprint,
								previous: typeof connectError.data.previous === "string" ? connectError.data.previous : void 0,
								changed: connectError.code === "host_key_changed"
							});
							setModalError("");
						} else setError(connectError.message);
					} else setError(errorText(connectError));
					try {
						await refreshServers();
					} catch {}
				} finally {
					setBusy("");
				}
			};
			const disconnectServer = async (server) => {
				setBusy(`disconnect:${server.id}`);
				setError("");
				try {
					await api.disconnect(server.id);
					await refreshServers();
					if (server.id === activeIdRef.current) setListing(null);
					setNotice("已断开连接");
				} catch (disconnectError) {
					setError(errorText(disconnectError));
				} finally {
					setBusy("");
				}
			};
			const saveServer = async (values) => {
				setBusy("save-server");
				setModalError("");
				try {
					const payload = {
						id: values.id,
						name: values.name,
						protocol: values.protocol,
						host: values.host,
						port: Number(values.port),
						username: values.username,
						allowInvalidCert: values.allowInvalidCert,
						...values.password ? { password: values.password } : {}
					};
					const saved = await api.saveServer(payload);
					const refreshed = await refreshServers();
					setActiveId(saved.id);
					persistActive(saved.id);
					setModal(null);
					setNotice(values.id ? "服务器已更新" : "服务器已保存");
					const savedServer = refreshed.find((item) => item.id === saved.id);
					if (savedServer?.connection?.state === "connected") {
						const path = pathsRef.current[saved.id] || savedServer.connection.home || "/";
						await loadDirectoryFor(saved.id, path);
					} else {
						loadSeq.current += 1;
						setLoading(false);
						setListing(null);
						setCurrentPath(pathsRef.current[saved.id] ?? "");
					}
				} catch (saveError) {
					setModalError(errorText(saveError));
				} finally {
					setBusy("");
				}
			};
			const deleteServer = async (server) => {
				if (!await askConfirm({
					title: "删除服务器",
					message: `确定删除“${server.name || server.host}”吗？\n保存的密码和主机指纹会一并删除，此操作不可撤销。`,
					confirmLabel: "删除",
					danger: true
				})) return;
				setBusy(`delete:${server.id}`);
				setError("");
				try {
					await api.deleteServer(server.id);
					const refreshed = await refreshServers();
					if (server.id === activeIdRef.current) {
						const next = refreshed[0];
						setActiveId(next?.id);
						persistActive(next?.id);
						setListing(null);
						setCurrentPath(next ? pathsRef.current[next.id] ?? "" : "");
						if (next?.connection?.state === "connected") {
							const path = pathsRef.current[next.id] || next.connection.home || "/";
							await loadDirectoryFor(next.id, path);
						}
					}
					setNotice("服务器已删除");
				} catch (deleteError) {
					setError(errorText(deleteError));
				} finally {
					setBusy("");
				}
			};
			const openDirectory = (entry) => {
				if (activeIdRef.current) loadDirectoryFor(activeIdRef.current, entry.path);
			};
			const enterEntry = (entry) => {
				if (entry.kind === "directory" || entry.kind === "symlink") openDirectory(entry);
			};
			const reloadCurrent = () => {
				if (activeIdRef.current) loadDirectoryFor(activeIdRef.current, currentPathRef.current);
			};
			const goUp = () => {
				if (currentPath === "/") return;
				if (activeIdRef.current) loadDirectoryFor(activeIdRef.current, parentOf(currentPath));
			};
			const download = (entry) => {
				if (!activeId) return;
				const anchor = document.createElement("a");
				anchor.href = api.downloadUrl(activeId, entry.path);
				anchor.rel = "noopener";
				anchor.download = entry.name;
				document.body.appendChild(anchor);
				anchor.click();
				anchor.remove();
			};
			const submitName = async (name) => {
				if (!activeId || modal?.type !== "name") return;
				setBusy("name");
				setModalError("");
				try {
					if (modal.mode === "mkdir") {
						await api.mkdir(activeId, modal.directory, name);
						setNotice("文件夹已创建");
					} else if (modal.entry) {
						await api.rename(activeId, modal.entry.path, name);
						setNotice("已重命名");
					}
					setModal(null);
					await loadDirectoryFor(activeId, currentPathRef.current);
				} catch (nameError) {
					setModalError(errorText(nameError));
				} finally {
					setBusy("");
				}
			};
			const deleteEntry = async (entry) => {
				if (!activeId) return;
				const isDirectory = entry.kind === "directory";
				if (!await askConfirm({
					title: isDirectory ? "递归删除目录" : "删除文件",
					message: isDirectory ? `将递归删除目录“${entry.name}”及其中的全部内容，无法恢复。\n继续吗？` : `确定删除“${entry.name}”吗？此操作无法恢复。`,
					confirmLabel: "删除",
					danger: true
				})) return;
				setBusy("delete-entry");
				setError("");
				try {
					await api.remove(activeId, entry.path);
					setSelectedPath(void 0);
					setNotice("已删除");
					await loadDirectoryFor(activeId, currentPathRef.current);
				} catch (deleteError) {
					setError(errorText(deleteError));
				} finally {
					setBusy("");
				}
			};
			const updateUpload = (key, patch) => {
				setUploads((previous) => previous.map((item) => item.key === key ? {
					...item,
					...patch
				} : item));
			};
			const uploadFiles = async (files, directory) => {
				const serverId = activeIdRef.current;
				if (!serverId || files.length === 0) return;
				setError("");
				for (const file of files) {
					const key = `upload-${++uploadSeq.current}`;
					const item = {
						key,
						name: file.name,
						loaded: 0,
						total: file.size,
						status: "pending"
					};
					setUploads((previous) => [...previous, item]);
					try {
						const target = joinRemote(directory, file.name);
						let existing = false;
						try {
							if ((await api.stat(serverId, target)).stat.kind === "directory") {
								updateUpload(key, {
									status: "error",
									error: "同名目录已存在"
								});
								continue;
							}
							existing = true;
						} catch (statError) {
							if (!(statError instanceof ApiError && statError.code === "not_found")) throw statError;
						}
						if (existing) {
							if (!await askConfirm({
								title: "覆盖文件",
								message: `目标目录中已存在“${file.name}”。\n确定覆盖吗？`,
								confirmLabel: "覆盖上传",
								danger: true
							})) {
								updateUpload(key, { status: "canceled" });
								continue;
							}
						}
						const controller = new AbortController();
						uploadControllers.current.set(key, controller);
						updateUpload(key, { status: "uploading" });
						await uploadFile({
							file,
							directory: {
								serverId,
								path: directory
							},
							overwrite: existing,
							signal: controller.signal,
							onProgress: (loaded, total) => updateUpload(key, {
								loaded,
								total
							})
						});
						updateUpload(key, {
							status: "done",
							loaded: file.size,
							total: file.size
						});
					} catch (uploadError) {
						if (uploadError instanceof DOMException && uploadError.name === "AbortError") updateUpload(key, { status: "canceled" });
						else updateUpload(key, {
							status: "error",
							error: errorText(uploadError)
						});
					} finally {
						uploadControllers.current.delete(key);
					}
				}
				if (currentPathRef.current === directory) reloadCurrent();
			};
			const chooseUpload = (directory) => {
				pendingUploadDir.current = directory;
				fileInputRef.current?.click();
			};
			const onFileInput = (files) => {
				if (files.length === 0) return;
				const directory = pendingUploadDir.current || currentPathRef.current;
				uploadFiles(files, directory);
			};
			const openContext = (event, entry) => {
				event.preventDefault();
				event.stopPropagation();
				const directory = entry?.kind === "directory" ? entry.path : currentPathRef.current;
				setContextMenu({
					x: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
					y: Math.max(8, Math.min(event.clientY, window.innerHeight - 300)),
					entry,
					directory
				});
				if (entry) setSelectedPath(entry.path);
			};
			const openNameModal = (mode, directory, entry) => {
				setContextMenu(null);
				setModalError("");
				setModal({
					type: "name",
					mode,
					directory,
					entry
				});
			};
			const openServerForm = (server) => {
				setContextMenu(null);
				setModalError("");
				setModal({
					type: "server-form",
					server
				});
			};
			const onDropRoot = (event) => {
				if (!hasFiles(event) || !connected) return;
				event.preventDefault();
				dragDepth.current = 0;
				setDragActive(false);
				setDropTarget(null);
				uploadFiles(Array.from(event.dataTransfer.files), currentPathRef.current);
			};
			const onDropOnEntry = (event, entry) => {
				if (!hasFiles(event) || entry.kind !== "directory") return;
				event.preventDefault();
				event.stopPropagation();
				dragDepth.current = 0;
				setDragActive(false);
				setDropTarget(null);
				uploadFiles(Array.from(event.dataTransfer.files), entry.path);
			};
			const renderContextMenu = () => {
				if (!contextMenu) return null;
				const { entry } = contextMenu;
				const close = () => setContextMenu(null);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					ref: contextRef,
					className: "dsd-ctx",
					style: {
						left: contextMenu.x,
						top: contextMenu.y
					},
					children: entry ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						entry.kind === "directory" || entry.kind === "symlink" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => {
								close();
								openDirectory(entry);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FolderIcon, { size: 14 }), " 打开"]
						}) : null,
						entry.kind !== "directory" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => {
								close();
								download(entry);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DownloadIcon, { size: 14 }), " 下载"]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => {
								close();
								chooseUpload(entry.path);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UploadIcon, { size: 14 }), " 上传到此目录"]
						}),
						entry.kind === "directory" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => openNameModal("mkdir", entry.path),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlusIcon, { size: 14 }), " 在此新建文件夹"]
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("hr", {}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => openNameModal("rename", contextMenu.directory, entry),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditIcon, { size: 14 }), " 重命名"]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "danger",
							onClick: () => {
								close();
								deleteEntry(entry);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrashIcon, { size: 14 }), " 删除"]
						})
					] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => {
								close();
								reloadCurrent();
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RefreshIcon, { size: 14 }), " 刷新"]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => openNameModal("mkdir", contextMenu.directory),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlusIcon, { size: 14 }), " 新建文件夹"]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => {
								close();
								chooseUpload(contextMenu.directory);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UploadIcon, { size: 14 }), " 上传文件"]
						})
					] })
				});
			};
			const renderServerManager = () => {
				if (modal?.type !== "servers") return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ServerManagerModal, {
					servers,
					activeId,
					busy: busyNow,
					onClose: () => setModal(null),
					onAdd: () => openServerForm(),
					onEdit: (server) => openServerForm(server),
					onDelete: (server) => {
						deleteServer(server);
					},
					onSelect: (server) => {
						setModal(null);
						selectServer(server);
					},
					onConnect: (server) => {
						setModal(null);
						connectServer(server);
					},
					onDisconnect: (server) => {
						disconnectServer(server);
					}
				});
			};
			const renderServerForm = () => {
				if (modal?.type !== "server-form") return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ServerFormModal, {
					server: modal.server,
					busy: busyNow,
					error: modalError,
					onCancel: () => {
						setModal(null);
						setModalError("");
					},
					onSubmit: (values) => {
						saveServer(values);
					}
				}, modal.server?.id ?? "new-server");
			};
			const renderHostKey = () => {
				if (modal?.type !== "hostkey") return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HostKeyModal, {
					endpoint: endpointOf(modal.server),
					fingerprint: modal.fingerprint,
					previous: modal.previous,
					changed: modal.changed,
					busy: busyNow,
					onCancel: () => setModal(null),
					onConfirm: () => {
						const server = modal.server;
						const fingerprint = modal.fingerprint;
						const changed = modal.changed;
						setModal(null);
						connectServer(server, {
							trustHostKey: true,
							hostKeyFingerprint: fingerprint,
							acceptChangedHostKey: changed
						});
					}
				});
			};
			const renderNameModal = () => {
				if (modal?.type !== "name") return null;
				const rename = modal.mode === "rename";
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NameModal, {
					title: rename ? "重命名" : "新建文件夹",
					label: rename ? "新名称" : "文件夹名称",
					initial: rename ? modal.entry?.name : "",
					confirmLabel: rename ? "重命名" : "创建",
					busy: busyNow,
					error: modalError,
					onCancel: () => {
						setModal(null);
						setModalError("");
					},
					onSubmit: (name) => {
						submitName(name);
					},
					hint: modal.mode === "mkdir" ? `位置：${modal.directory}` : void 0
				}, `${modal.mode}:${modal.entry?.path ?? modal.directory}`);
			};
			const renderError = () => {
				if (!error) return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsd-error",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "grow",
						children: error
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "dsd-icon-btn",
						type: "button",
						title: "关闭",
						onClick: () => setError(""),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CloseIcon, { size: 13 })
					})]
				});
			};
			const renderToolbar = () => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsd-toolbar",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsd-server-picker",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `dsd-dot${activeState === "connected" ? " on" : activeState === "error" ? " err" : ""}` }), servers.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							className: "dsd-select",
							value: activeId ?? "",
							onChange: (event) => {
								const server = servers.find((item) => item.id === event.target.value);
								if (server) selectServer(server);
							},
							title: "切换服务器",
							children: servers.map((server) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
								value: server.id,
								children: [
									server.name || server.host,
									" · ",
									protocolLabel(server)
								]
							}, server.id))
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsd-select",
							style: {
								display: "flex",
								alignItems: "center",
								opacity: .65
							},
							children: "未添加服务器"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "dsd-icon-btn",
						type: "button",
						title: "服务器管理",
						onClick: () => setModal({ type: "servers" }),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsIcon, { size: 15 })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "dsd-icon-btn",
						type: "button",
						title: "添加服务器",
						onClick: () => openServerForm(),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlusIcon, { size: 15 })
					})
				]
			});
			const renderFootbar = () => {
				if (!activeServer) return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsd-footbar",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `dsd-dot${activeState === "connected" ? " on" : activeState === "error" ? " err" : ""}` }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "grow",
							title: endpointOf(activeServer),
							children: [activeState === "connected" ? listing?.truncated ? "目录过大，仅显示前 5000 项" : `${entries.length} 项` : "未连接", activeState === "connected" ? ` · ${protocolLabel(activeServer)}` : ""]
						}),
						uploads.some((item) => item.status === "done" || item.status === "error" || item.status === "canceled") ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dsd-btn subtle",
							type: "button",
							style: {
								minHeight: 20,
								padding: "0 5px"
							},
							onClick: () => setUploads((items) => items.filter((item) => item.status === "uploading" || item.status === "pending")),
							children: "清除记录"
						}) : null
					]
				});
			};
			const renderUploads = () => {
				if (uploads.length === 0) return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsd-uploads",
					children: uploads.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsd-upload-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "name",
							title: item.name,
							children: item.name
						}), item.status === "uploading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsd-progress",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { width: `${item.total > 0 ? Math.min(100, Math.round(item.loaded / item.total * 100)) : 0}%` } })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "state",
								children: item.total > 0 ? `${Math.round(item.loaded / item.total * 100)}%` : ""
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsd-icon-btn",
								type: "button",
								title: "取消上传",
								onClick: () => uploadControllers.current.get(item.key)?.abort(),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CloseIcon, { size: 12 })
							})
						] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `state${item.status === "error" ? " err" : ""}`,
							title: item.error,
							children: item.status === "pending" ? "等待" : item.status === "done" ? "完成" : item.status === "canceled" ? "已取消" : item.error || "失败"
						})]
					}, item.key))
				});
			};
			const renderConnectCard = () => {
				if (!activeServer) return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsd-banner",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ServerIcon, { size: 14 }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "grow",
							children: [
								protocolLabel(activeServer),
								" · ",
								endpointOf(activeServer)
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dsd-icon-btn",
							type: "button",
							title: "编辑服务器",
							onClick: () => openServerForm(activeServer),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditIcon, { size: 14 })
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsd-card",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsd-card-title",
							children: activeServer.name || activeServer.host
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsd-card-desc",
							children: activeServer.connection?.lastError || "连接后即可浏览服务器目录、创建文件夹、上传和下载文件。"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsd-card-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsd-btn primary",
								type: "button",
								disabled: busyNow,
								onClick: () => {
									connectServer(activeServer);
								},
								children: busy === `connect:${activeServer.id}` ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsd-spinner" }), " 连接中…"] }) : "连接服务器"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsd-btn",
								type: "button",
								onClick: () => setModal({ type: "servers" }),
								children: "管理服务器"
							})]
						})
					]
				})] });
			};
			const renderBrowser = () => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsd-pathbar",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dsd-icon-btn",
							type: "button",
							title: "上一级",
							disabled: busyNow || currentPath === "/",
							onClick: goUp,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UpIcon, { size: 15 })
						}),
						editingPath ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
							style: {
								flex: 1,
								minWidth: 0,
								display: "flex",
								gap: 4
							},
							onSubmit: (event) => {
								event.preventDefault();
								setEditingPath(false);
								if (activeIdRef.current && pathDraft.trim() !== "") loadDirectoryFor(activeIdRef.current, pathDraft);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "dsd-path-input",
								style: { flex: 1 },
								value: pathDraft,
								autoFocus: true,
								spellCheck: false,
								onChange: (event) => setPathDraft(event.target.value),
								onBlur: (event) => {
									const next = event.relatedTarget;
									if (next instanceof Node && event.currentTarget.form?.contains(next)) return;
									setEditingPath(false);
								},
								placeholder: "输入远端路径（Enter 前往），支持 ~ 和相对路径"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsd-btn",
								type: "submit",
								style: {
									minHeight: 26,
									padding: "0 7px"
								},
								children: "前往"
							})]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsd-crumbs",
							children: [crumbsOf(currentPath).map((crumb, index, all) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									display: "inline-flex",
									alignItems: "center",
									minWidth: 0
								},
								children: [index > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsd-sep",
									children: "›"
								}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: `dsd-crumb${index === all.length - 1 ? " current" : ""}`,
									type: "button",
									title: crumb.path,
									onClick: () => {
										if (activeIdRef.current) loadDirectoryFor(activeIdRef.current, crumb.path);
									},
									children: crumb.label
								})]
							}, `${crumb.path}-${index}`)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsd-icon-btn",
								type: "button",
								title: "输入路径",
								style: {
									width: 22,
									height: 22
								},
								onClick: () => {
									setPathDraft(currentPath);
									setEditingPath(true);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditIcon, { size: 12 })
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dsd-icon-btn",
							type: "button",
							title: "刷新",
							disabled: loading || busyNow,
							onClick: reloadCurrent,
							children: loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsd-spinner" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RefreshIcon, { size: 15 })
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsd-manage-bar",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							className: "dsd-btn subtle",
							type: "button",
							disabled: busyNow,
							onClick: () => openNameModal("mkdir", currentPath),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlusIcon, { size: 14 }), " 新建文件夹"]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							className: "dsd-btn subtle",
							type: "button",
							disabled: busyNow,
							onClick: () => chooseUpload(currentPath),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UploadIcon, { size: 14 }), " 上传"]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { flex: 1 } }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "dsd-btn subtle",
							type: "button",
							disabled: busyNow,
							onClick: () => void disconnectServer(activeServer),
							title: "断开连接",
							children: "断开"
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: `dsd-list-wrap dsd-drop-root${dragActive ? " dragover" : ""}`,
					style: {
						flex: 1,
						minHeight: 0
					},
					onContextMenu: (event) => openContext(event),
					onDragEnter: (event) => {
						if (!hasFiles(event)) return;
						event.preventDefault();
						dragDepth.current += 1;
						setDragActive(true);
					},
					onDragOver: (event) => {
						if (!hasFiles(event)) return;
						event.preventDefault();
						event.dataTransfer.dropEffect = "copy";
					},
					onDragLeave: (event) => {
						if (!hasFiles(event)) return;
						dragDepth.current = Math.max(0, dragDepth.current - 1);
						if (dragDepth.current === 0) {
							setDragActive(false);
							setDropTarget(null);
						}
					},
					onDrop: onDropRoot,
					children: [dragActive ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsd-banner",
						style: {
							position: "sticky",
							top: 0,
							zIndex: 2,
							pointerEvents: "none",
							background: "var(--dsw-alias-bg-layer-2, transparent)"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UploadIcon, { size: 13 }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "grow",
							children: ["松开以上传到 ", dropTarget ?? currentPath]
						})]
					}) : null, loading && !listing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsd-empty",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dsd-spinner" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsd-empty-desc",
							children: "正在读取目录…"
						})]
					}) : entries.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsd-empty",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsd-empty-icon",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FolderIcon, { size: 30 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsd-empty-title",
								children: "空目录"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsd-empty-desc",
								children: "新建文件夹，或把本地文件拖到这里上传。"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "dsd-card-actions",
								style: { justifyContent: "center" },
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									className: "dsd-btn",
									type: "button",
									onClick: () => openNameModal("mkdir", currentPath),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlusIcon, { size: 14 }), " 新建文件夹"]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									className: "dsd-btn",
									type: "button",
									onClick: () => chooseUpload(currentPath),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UploadIcon, { size: 14 }), " 上传"]
								})]
							})
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsd-list",
						role: "list",
						children: entries.map((entry) => {
							const dropHere = dropTarget === entry.path && entry.kind === "directory";
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								role: "listitem",
								className: `dsd-entry ${entry.kind}${selectedPath === entry.path ? " selected" : ""}${dropHere ? " dragover" : ""}`,
								onContextMenu: (event) => openContext(event, entry),
								onClick: () => setSelectedPath(entry.path),
								onDoubleClick: () => enterEntry(entry),
								onDragOver: (event) => {
									if (!hasFiles(event) || entry.kind !== "directory") return;
									event.preventDefault();
									event.stopPropagation();
									setDropTarget(entry.path);
								},
								onDragLeave: (event) => {
									if (!hasFiles(event) || entry.kind !== "directory") return;
									event.stopPropagation();
									setDropTarget((previous) => previous === entry.path ? null : previous);
								},
								onDrop: (event) => onDropOnEntry(event, entry),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "dsd-entry-icon",
										children: entryIcon(entry)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsd-entry-main",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsd-entry-name",
											title: entry.name,
											style: entry.kind === "directory" || entry.kind === "symlink" ? { cursor: "pointer" } : void 0,
											onClick: (event) => {
												if (entry.kind === "directory" || entry.kind === "symlink") {
													event.stopPropagation();
													openDirectory(entry);
												}
											},
											children: entry.name
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "dsd-entry-sub",
											children: [entry.kind === "directory" ? "文件夹" : entry.isSymlink ? "链接" : entry.kind === "file" ? formatSize(entry.size) : "未知", entry.mtime ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["· ", formatTime(entry.mtime)] }) : null]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "dsd-entry-actions",
										children: [
											entry.kind === "directory" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "dsd-icon-btn",
												type: "button",
												title: "打开",
												onClick: (event) => {
													event.stopPropagation();
													openDirectory(entry);
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronIcon, { size: 14 })
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "dsd-icon-btn",
												type: "button",
												title: "下载",
												onClick: (event) => {
													event.stopPropagation();
													download(entry);
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DownloadIcon, { size: 14 })
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "dsd-icon-btn",
												type: "button",
												title: "重命名",
												disabled: busyNow,
												onClick: (event) => {
													event.stopPropagation();
													openNameModal("rename", currentPath, entry);
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditIcon, { size: 14 })
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "dsd-icon-btn danger",
												type: "button",
												title: "删除",
												disabled: busyNow,
												onClick: (event) => {
													event.stopPropagation();
													deleteEntry(entry);
												},
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrashIcon, { size: 14 })
											})
										]
									})
								]
							}, entry.path);
						})
					})]
				}),
				dragActive ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsd-banner",
					style: {
						pointerEvents: "none",
						color: "var(--dsw-alias-brand-primary, #4d6bfe)"
					},
					children: "拖拽文件到目录行可上传到对应目录"
				}) : null
			] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsd-root",
				children: [
					renderToolbar(),
					error ? renderError() : null,
					notice ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsd-notice",
						children: notice
					}) : null,
					servers.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsd-empty",
						style: { flex: 1 },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsd-empty-icon",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ServerIcon, { size: 34 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsd-empty-title",
								children: "添加第一台服务器"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsd-empty-desc",
								children: "填写服务器地址、账号和密码，连接后即可在侧栏管理远端目录。"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: "dsd-btn primary",
								type: "button",
								onClick: () => openServerForm(),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlusIcon, { size: 14 }), " 添加服务器"]
							})
						]
					}) : !activeServer ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsd-empty",
						style: { flex: 1 },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsd-empty-title",
								children: "选择服务器"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsd-empty-desc",
								children: "从上方下拉框选择一台服务器，或打开服务器管理。"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "dsd-btn",
								type: "button",
								onClick: () => setModal({ type: "servers" }),
								children: "服务器管理"
							})
						]
					}) : !connected ? renderConnectCard() : renderBrowser(),
					renderUploads(),
					renderFootbar(),
					renderContextMenu(),
					renderServerManager(),
					renderServerForm(),
					renderHostKey(),
					renderNameModal(),
					confirmRequest ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfirmModal, {
						title: confirmRequest.title,
						message: confirmRequest.message,
						confirmLabel: confirmRequest.confirmLabel,
						danger: confirmRequest.danger,
						onCancel: () => settleConfirm(false),
						onConfirm: () => settleConfirm(true)
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						ref: fileInputRef,
						className: "dsd-hidden-file-input",
						type: "file",
						multiple: true,
						onChange: (event) => {
							const files = Array.from(event.target.files ?? []);
							event.target.value = "";
							onFileInput(files);
						}
					})
				]
			});
		}
		// src/client/styles.ts
		/** Theme-aware styles for the server directory panel. */
		const STYLE_ID = "dsh-server-directory-style-v1";
		const CSS = `
.dsd-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--dsw-alias-bg-layer-1, transparent);
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 12.5px;
  line-height: 1.45;
  box-sizing: border-box;
  position: relative;
}
.dsd-root *, .dsd-root *::before, .dsd-root *::after { box-sizing: border-box; }
.dsd-root button, .dsd-root input, .dsd-root select { font: inherit; color: inherit; }
.dsd-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
  flex: none;
  min-width: 0;
  background: var(--dsw-alias-bg-layer-1, transparent);
}
.dsd-server-picker {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
}
.dsd-select {
  min-width: 0;
  flex: 1;
  height: 28px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-base, transparent);
  border-radius: 7px;
  padding: 0 7px;
  outline: none;
}
.dsd-select:focus { border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dsd-dot {
  width: 7px; height: 7px; border-radius: 50%; flex: none;
  background: var(--dsw-alias-label-tertiary, #888);
}
.dsd-dot.on { background: var(--dsw-alias-state-success-primary, #3d9a5f); }
.dsd-dot.err { background: var(--dsw-alias-state-error-primary, #d9534f); }
.dsd-icon-btn {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #888);
  border-radius: 7px;
  width: 28px; height: 28px;
  display: inline-grid; place-items: center;
  padding: 0; cursor: pointer; flex: none;
}
.dsd-icon-btn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12));
  color: var(--dsw-alias-label-primary, inherit);
}
.dsd-icon-btn:disabled { opacity: .4; cursor: not-allowed; }
.dsd-icon-btn.danger { color: var(--dsw-alias-state-error-primary, #d9534f); }
.dsd-icon-btn.active { background: var(--dsw-alias-interactive-bg-active, rgba(77,107,254,.15)); color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dsd-btn {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-layer-2, transparent);
  color: var(--dsw-alias-label-primary, inherit);
  border-radius: 7px;
  min-height: 28px;
  padding: 4px 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  white-space: nowrap;
}
.dsd-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dsd-btn:disabled { opacity: .45; cursor: not-allowed; }
.dsd-btn.primary {
  background: var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #4d6bfe));
  color: var(--dsw-alias-label-primary-inverted, #fff);
  border-color: transparent;
}
.dsd-btn.primary:hover:not(:disabled) { filter: brightness(1.06); background: var(--dsw-alias-button-primary-hover, var(--dsw-alias-brand-primary, #4d6bfe)); }
.dsd-btn.danger {
  color: var(--dsw-alias-state-error-primary, #d9534f);
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d9534f) 45%, transparent);
}
.dsd-btn.subtle { border-color: transparent; background: transparent; }
.dsd-pathbar {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 8px; flex: none; min-width: 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
}
.dsd-crumbs {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 1px;
  overflow: hidden; white-space: nowrap;
  direction: ltr;
}
.dsd-crumb {
  border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #888);
  padding: 3px 4px; border-radius: 5px; cursor: pointer;
  max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dsd-crumb:hover { color: var(--dsw-alias-label-primary, inherit); background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.12)); }
.dsd-crumb.current { color: var(--dsw-alias-label-primary, inherit); font-weight: 600; }
.dsd-sep { color: var(--dsw-alias-label-tertiary, #888); opacity: .6; flex: none; }
.dsd-path-input {
  height: 26px; width: 100%; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-base, transparent);
  padding: 0 7px; outline: none;
}
.dsd-manage-bar {
  display: flex; align-items: center; justify-content: flex-end; gap: 4px;
  padding: 5px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
  flex: none;
}
.dsd-list-wrap { flex: 1; min-height: 0; overflow: auto; position: relative; }
.dsd-list { display: flex; flex-direction: column; padding: 4px 5px 12px; min-height: 100%; }
.dsd-entry {
  display: flex; align-items: center; gap: 7px;
  min-height: 33px; padding: 4px 6px; border-radius: 6px;
  border: 1px solid transparent; cursor: default; position: relative;
  user-select: none;
}
.dsd-entry:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.1)); }
.dsd-entry.selected {
  background: var(--dsw-alias-interactive-bg-active, rgba(77,107,254,.14));
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 35%, transparent);
}
.dsd-entry.dragover {
  border-color: var(--dsw-alias-brand-primary, #4d6bfe);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 13%, transparent);
}
.dsd-entry-icon { flex: none; display: inline-grid; place-items: center; width: 18px; color: var(--dsw-alias-label-secondary, #888); }
.dsd-entry.directory .dsd-entry-icon { color: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary, #4d6bfe)); }
.dsd-entry-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.dsd-entry-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary, inherit); }
.dsd-entry.directory .dsd-entry-name { cursor: pointer; }
.dsd-entry-sub { font-size: 10.5px; color: var(--dsw-alias-label-tertiary, #888); display: flex; gap: 6px; overflow: hidden; white-space: nowrap; }
.dsd-entry-actions { display: flex; align-items: center; gap: 1px; opacity: 0; flex: none; transition: opacity .12s; }
.dsd-entry:hover .dsd-entry-actions, .dsd-entry.selected .dsd-entry-actions { opacity: 1; }
.dsd-entry-actions .dsd-icon-btn { width: 25px; height: 25px; }
.dsd-drop-root {
  outline: 1px dashed transparent;
  outline-offset: -4px;
}
.dsd-drop-root.dragover {
  outline-color: var(--dsw-alias-brand-primary, #4d6bfe);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 6%, transparent);
}
.dsd-empty {
  flex: 1; min-height: 150px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 9px;
  padding: 26px 18px; color: var(--dsw-alias-label-secondary, #888);
  text-align: center;
}
.dsd-empty-icon { opacity: .55; }
.dsd-empty-title { font-weight: 600; color: var(--dsw-alias-label-primary, inherit); }
.dsd-empty-desc { max-width: 260px; font-size: 11.5px; line-height: 1.55; }
.dsd-card {
  margin: 10px; padding: 13px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-base, transparent);
}
.dsd-card-title { font-weight: 600; margin-bottom: 4px; }
.dsd-card-desc { color: var(--dsw-alias-label-secondary, #888); margin-bottom: 10px; font-size: 11.5px; line-height: 1.55; }
.dsd-card-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.dsd-footbar {
  flex: none; display: flex; align-items: center; gap: 6px;
  padding: 6px 9px; min-height: 27px;
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
  color: var(--dsw-alias-label-tertiary, #888); font-size: 10.5px;
  overflow: hidden;
}
.dsd-footbar .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsd-error {
  flex: none; display: flex; gap: 6px; align-items: flex-start;
  padding: 7px 9px; margin: 0;
  color: var(--dsw-alias-state-error-primary, #d9534f);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #d9534f) 9%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary, #d9534f) 25%, transparent);
  font-size: 11.5px; white-space: pre-wrap;
}
.dsd-error .grow { flex: 1; min-width: 0; }
.dsd-notice {
  flex: none; padding: 6px 9px; font-size: 11.5px;
  color: var(--dsw-alias-state-success-primary, #3d9a5f);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #3d9a5f) 8%, transparent);
}
.dsd-uploads {
  flex: none; border-top: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
  max-height: 130px; overflow: auto; padding: 5px 8px; display: flex; flex-direction: column; gap: 4px;
}
.dsd-upload-row { display: flex; align-items: center; gap: 6px; font-size: 10.5px; min-width: 0; }
.dsd-upload-row .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsd-upload-row .state { color: var(--dsw-alias-label-secondary, #888); flex: none; }
.dsd-upload-row .state.err { color: var(--dsw-alias-state-error-primary, #d9534f); }
.dsd-progress { height: 3px; border-radius: 2px; background: var(--dsw-alias-border-l1, rgba(127,127,127,.2)); overflow: hidden; width: 70px; flex: none; }
.dsd-progress > span { display: block; height: 100%; background: var(--dsw-alias-brand-primary, #4d6bfe); transition: width .15s; }
.dsd-spinner {
  width: 13px; height: 13px; border-radius: 50%;
  border: 2px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  border-top-color: var(--dsw-alias-brand-primary, #4d6bfe);
  animation: dsd-spin .8s linear infinite; flex: none;
}
@keyframes dsd-spin { to { transform: rotate(360deg); } }
.dsd-banner {
  display: flex; align-items: center; gap: 8px; padding: 7px 9px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
  color: var(--dsw-alias-label-secondary, #888); font-size: 11px; flex: none;
}
.dsd-banner .grow { flex: 1; min-width: 0; }
.dsd-modal-layer {
  position: absolute; inset: 0; z-index: 40;
  display: flex; align-items: stretch; justify-content: center;
  padding: 14px 10px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base, #111) 30%, transparent);
  backdrop-filter: blur(2px);
  overflow: auto;
}
.dsd-modal {
  margin: auto; width: 100%; max-width: 380px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1, #1d1d22));
  color: var(--dsw-alias-label-primary, inherit);
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  border-radius: 11px;
  box-shadow: 0 16px 42px color-mix(in srgb, #000 30%, transparent);
  display: flex; flex-direction: column; max-height: 100%;
}
.dsd-modal-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18)); }
.dsd-modal-title { font-weight: 600; flex: 1; min-width: 0; }
.dsd-modal-body { padding: 12px; overflow: auto; min-height: 0; }
.dsd-modal-foot { display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding: 9px 12px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18)); flex-wrap: wrap; }
.dsd-field { display: block; margin-bottom: 9px; }
.dsd-label { display: block; font-size: 11px; font-weight: 600; color: var(--dsw-alias-label-secondary, #888); margin-bottom: 4px; }
.dsd-input {
  width: 100%; height: 30px; border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-base, transparent);
  padding: 0 8px; outline: none;
}
.dsd-input:focus { border-color: var(--dsw-alias-brand-primary, #4d6bfe); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 18%, transparent); }
.dsd-input:disabled { opacity: .6; }
.dsd-check { display: flex; align-items: flex-start; gap: 7px; padding: 5px 0; cursor: pointer; font-size: 11.5px; color: var(--dsw-alias-label-primary, inherit); }
.dsd-check input { margin-top: 2px; accent-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dsd-hint { color: var(--dsw-alias-label-tertiary, #888); font-size: 10.5px; line-height: 1.5; margin-top: 4px; }
.dsd-warn { color: var(--dsw-alias-state-warn-primary, #d89b2b); font-size: 10.5px; line-height: 1.5; margin-top: 4px; }
.dsd-server-list { display: flex; flex-direction: column; gap: 5px; }
.dsd-server-item {
  display: flex; align-items: center; gap: 7px;
  padding: 7px; border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.2)); border-radius: 8px;
  min-width: 0;
}
.dsd-server-item.active { border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.dsd-server-item .main { flex: 1; min-width: 0; }
.dsd-server-item .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsd-server-item .endpoint { color: var(--dsw-alias-label-tertiary, #888); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsd-server-item .actions { display: flex; gap: 2px; flex: none; }
.dsd-ctx {
  position: fixed; z-index: 2147483000;
  min-width: 175px; max-width: 240px; padding: 4px;
  background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2, #222));
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  border-radius: 8px;
  box-shadow: 0 12px 30px color-mix(in srgb, #000 28%, transparent);
}
.dsd-ctx button {
  display: flex; align-items: center; gap: 7px;
  width: 100%; text-align: left; border: 0; background: transparent;
  color: var(--dsw-alias-label-primary, inherit); border-radius: 5px;
  padding: 6px 8px; cursor: pointer; font-size: 11.5px;
}
.dsd-ctx button:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14)); }
.dsd-ctx button.danger { color: var(--dsw-alias-state-error-primary, #d9534f); }
.dsd-ctx hr { border: 0; border-top: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.2)); margin: 3px 4px; }
.dsd-fingerprint {
  margin: 8px 0; padding: 8px; border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  background: var(--dsw-alias-bg-base, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.5px; word-break: break-all; line-height: 1.55;
}
.dsd-protocol-tag {
  font-size: 9.5px; font-weight: 600; letter-spacing: .02em;
  color: var(--dsw-alias-label-secondary, #888);
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3));
  border-radius: 4px; padding: 0 4px; flex: none;
}
.dsd-hidden-file-input { display: none; }
@media (max-width: 420px) {
  .dsd-entry-actions { opacity: 1; }
  .dsd-crumb { max-width: 80px; }
}
`;
		// src/client/index.tsx
		/**
		* Client half of dsh-server-directory. Registers one better-sidebar tab; all
		* remote work is done by the plugin's host half through fenced HTTP routes.
		*/
		const inject = ["betterSidebar"];
		function installStyles() {
			if (typeof document === "undefined") return () => void 0;
			const previous = document.getElementById(STYLE_ID);
			if (previous) previous.remove();
			const element = document.createElement("style");
			element.id = STYLE_ID;
			element.textContent = CSS;
			document.head.appendChild(element);
			return () => {
				try {
					element.remove();
				} catch {}
			};
		}
		function apply(ctx) {
			ctx.effect(() => installStyles(), "dsh-server-directory: styles");
			ctx.effect(() => ctx.betterSidebar.registerTab({
				id: "dsh-server-directory:files",
				title: () => "服务器目录",
				description: () => "连接 SFTP / FTP 服务器并管理远端目录",
				icon: (size) => (0, react.createElement)(ServerIcon, { size }),
				order: 55,
				single: true,
				component: (props) => (0, react.createElement)(ServerDirectoryPanel, { visible: props.visible })
			}), "dsh-server-directory: sidebar tab");
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map