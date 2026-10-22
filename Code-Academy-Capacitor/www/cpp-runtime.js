
/*
 * Code Academy C++ Runtime
 * Uses the documented Compiler Explorer REST API.
 *
 * Required by CppEditor.html:
 * on, getCompilers, getLibraries, getFormatters, compile, format, stop
 *
 * IMPORTANT:
 * C++ source files are sent to Compiler Explorer when compiling.
 */
(function (global) {
  "use strict";

  const API_ROOT = "https://godbolt.org/api";
  const DEFAULT_TIMEOUT_MS = 45000;

  let compilerCache = null;
  let libraryCache = null;
  let formatterCache = null;

  const activeRequests = new Set();
  const listeners = new Set();

  function emit(type, detail) {
    const event = Object.assign({ type: type }, detail || {});

    listeners.forEach(function (listener) {
      try {
        listener(event);
      } catch (error) {
        console.error("C++ runtime listener error:", error);
      }
    });
  }

  function textValue(value) {
    if (value === null || value === undefined) return "";

    if (typeof value === "string") return value;

    if (
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value
        .map(function (item) {
          if (
            item &&
            typeof item === "object" &&
            typeof item.text === "string"
          ) {
            return item.text;
          }

          return textValue(item);
        })
        .filter(function (item) {
          return item !== "";
        })
        .join("\n");
    }

    if (typeof value === "object") {
      if (typeof value.text === "string") return value.text;
      if (typeof value.message === "string") return value.message;
      if (typeof value.output === "string") return value.output;

      try {
        return JSON.stringify(value);
      } catch (_) {
        return "";
      }
    }

    return "";
  }

  function asNumber(value) {
    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return value;
    }

    if (
      typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }

    return null;
  }

  async function requestJSON(url, options, timeoutMs) {
    if (typeof fetch !== "function") {
      throw new Error(
        "This browser does not support fetch(). Update your browser to use the C++ compiler."
      );
    }

    if (typeof AbortController !== "function") {
      throw new Error(
        "This browser does not support request cancellation. Update your browser to use the C++ compiler."
      );
    }

    const controller = new AbortController();

    const duration = Math.max(
      1000,
      Number(timeoutMs) || DEFAULT_TIMEOUT_MS
    );

    const timer = setTimeout(function () {
      controller.abort();
    }, duration);

    activeRequests.add(controller);

    const requestOptions = Object.assign(
      {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        headers: {
          Accept: "application/json"
        },
        signal: controller.signal
      },
      options || {}
    );

    requestOptions.headers = Object.assign(
      { Accept: "application/json" },
      requestOptions.headers || {}
    );

    emit("status", {
      phase: "request",
      text: "Contacting Compiler Explorer…"
    });

    try {
      const response = await fetch(url, requestOptions);
      const bodyText = await response.text();

      let data = {};

      if (bodyText) {
        try {
          data = JSON.parse(bodyText);
        } catch (_) {
          data = {
            message: bodyText.slice(0, 1200)
          };
        }
      }

      if (!response.ok) {
        const detail =
          data &&
          (data.message || data.error || data.stderr);

        throw new Error(
          "Compiler Explorer returned HTTP " +
          response.status +
          (detail ? ": " + textValue(detail) : ".")
        );
      }

      return data;
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error(
          "The compiler request was cancelled or timed out. Try again with a smaller program."
        );
      }

      if (error instanceof TypeError) {
        throw new Error(
          "Could not reach Compiler Explorer. Check your internet connection and try again."
        );
      }

      throw error;
    } finally {
      clearTimeout(timer);
      activeRequests.delete(controller);
    }
  }

  function versionNumber(value) {
    const match = String(value || "").match(/\d+(?:\.\d+)*/);

    return match
      ? match[0].split(".").map(function (part) {
          return Number(part) || 0;
        })
      : [0];
  }

  function compareVersionsNewestFirst(a, b) {
    const left = versionNumber(a.semver || a.name || a.id);
    const right = versionNumber(b.semver || b.name || b.id);

    const length = Math.max(left.length, right.length);

    for (let i = 0; i < length; i += 1) {
      const difference = (right[i] || 0) - (left[i] || 0);

      if (difference !== 0) return difference;
    }

    return String(a.name || a.id || "").localeCompare(
      String(b.name || b.id || "")
    );
  }

  function normalizeCompilers(payload) {
    const raw = Array.isArray(payload)
      ? payload
      : (
          payload && Array.isArray(payload.compilers)
            ? payload.compilers
            : []
        );

    const candidates = raw.filter(function (item) {
      return (
        item &&
        item.id &&
        item.name &&
        /(?:gcc|g\+\+|clang|llvm)/i.test(
          String(item.name) + " " + String(item.id)
        )
      );
    });

    const stable = candidates.filter(function (item) {
      return !item.releaseTrack ||
        item.releaseTrack === "stable";
    });

    const nonExperimental = candidates.filter(function (item) {
      return item.releaseTrack !== "experimental";
    });

    const preferred = stable.length
      ? stable
      : (
          nonExperimental.length
            ? nonExperimental
            : candidates
        );

    const seen = new Set();

    const unique = preferred.filter(function (item) {
      const id = String(item.id);

      if (seen.has(id)) return false;

      seen.add(id);
      return true;
    });

    return unique.sort(function (a, b) {
      const aClang = /clang|llvm/i.test(
        String(a.name) + " " + String(a.id)
      );

      const bClang = /clang|llvm/i.test(
        String(b.name) + " " + String(b.id)
      );

      if (aClang !== bClang) {
        return aClang ? 1 : -1;
      }

      return compareVersionsNewestFirst(a, b);
    });
  }

  async function getCompilers(options) {
    if (options && options.force) {
      compilerCache = null;
    }

    if (compilerCache) {
      return compilerCache.slice();
    }

    const url =
      API_ROOT +
      "/compilers/c%2B%2B?fields=id,name,semver,releaseTrack,compilerType";

    const payload = await requestJSON(url);
    const compilers = normalizeCompilers(payload);

    if (!compilers.length) {
      throw new Error(
        "Compiler Explorer returned no usable GCC or Clang C++ compilers."
      );
    }

    compilerCache = compilers;

    emit("compilers", {
      compilers: compilerCache.slice()
    });

    return compilerCache.slice();
  }

  function versionId(value) {
    if (
      typeof value === "string" ||
      typeof value === "number"
    ) {
      return String(value);
    }

    if (!value || typeof value !== "object") {
      return "";
    }

    return String(
      value.id ||
      value.versionId ||
      value.version ||
      value.name ||
      ""
    );
  }

  function normalizeLibraries(payload) {
    const raw = Array.isArray(payload)
      ? payload
      : (
          payload && Array.isArray(payload.libraries)
            ? payload.libraries
            : []
        );

    const libraries = [];

    raw.forEach(function (item) {
      if (!item || typeof item !== "object") return;

      const id = String(item.id || item.name || "").trim();
      const name = String(item.name || item.id || "").trim();

      if (!id || !name) return;

      let source = item.versions;

      if (source === undefined || source === null) {
        source = item.version;
      }

      if (source === undefined || source === null) {
        source = item.versionId;
      }

      let versions = [];

      if (Array.isArray(source)) {
        versions = source.map(versionId).filter(Boolean);
      } else if (source && typeof source === "object") {
        versions = Object.keys(source);
      } else if (
        typeof source === "string" ||
        typeof source === "number"
      ) {
        versions = String(source)
          .split(":")
          .map(function (part) {
            return part.trim();
          })
          .filter(Boolean);
      }

      versions = Array.from(new Set(versions));

      libraries.push({
        id: id,
        name: name,
        description: String(
          item.description || item.summary || ""
        ),
        versions: versions
      });
    });

    libraries.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    return libraries;
  }

  async function getLibraries(options) {
    if (options && options.force) {
      libraryCache = null;
    }

    if (libraryCache) {
      return libraryCache.slice();
    }

    const payload = await requestJSON(
      API_ROOT + "/libraries/c%2B%2B"
    );

    libraryCache = normalizeLibraries(payload);

    emit("libraries", {
      libraries: libraryCache.slice()
    });

    return libraryCache.slice();
  }

  async function getFormatters(options) {
    if (options && options.force) {
      formatterCache = null;
    }

    if (formatterCache) {
      return formatterCache.slice();
    }

    const payload = await requestJSON(
      API_ROOT + "/formats"
    );

    formatterCache = Array.isArray(payload)
      ? payload
      : (
          payload && Array.isArray(payload.formats)
            ? payload.formats
            : []
        );

    return formatterCache.slice();
  }

  function fallbackFormat(source) {
    const input = String(source == null ? "" : source);

    if (!input) return "";

    return input
      .split(/\r?\n/)
      .map(function (line) {
        return line.replace(/[\t ]+$/g, "");
      })
      .join("\n")
      .replace(/\n*$/g, "") + "\n";
  }

  async function format(source) {
    const original = String(
      source == null ? "" : source
    );

    try {
      const formatters = await getFormatters();

      const formatter = formatters.find(function (item) {
        return /clang-format/i.test(
          String(item.name || "") + " " +
          String(item.type || "")
        );
      });

      if (!formatter) {
        return fallbackFormat(original);
      }

      const formatterName = String(
        formatter.name || formatter.type || ""
      ).trim();

      if (!formatterName) {
        return fallbackFormat(original);
      }

      const result = await requestJSON(
        API_ROOT + "/format/" +
          encodeURIComponent(formatterName),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            source: original,
            base: "Google",
            useSpaces: true,
            tabWidth: 4
          })
        }
      );

      if (
        result &&
        typeof result.answer === "string" &&
        !result.throw &&
        asNumber(result.exit) === 0
      ) {
        return result.answer;
      }

      return fallbackFormat(original);
    } catch (_) {
      emit("status", {
        phase: "format-fallback",
        text: "Remote formatter unavailable; removed trailing whitespace instead."
      });

      return fallbackFormat(original);
    }
  }

  /*
   * Compiler Explorer can return buildResult diagnostics separately
   * from the program's stdout, stderr, and exit code.
   *
   * Keep compileCode separate from executionCode:
   * a program may compile successfully and intentionally return 1.
   */
  function normalizeCompileResponse(payload, executeRequested) {
    const data =
      payload && typeof payload === "object"
        ? payload
        : {};

    const build =
      data.buildResult ||
      data.compileResult ||
      data.compile ||
      null;

    const hasBuild = Boolean(
      build && typeof build === "object"
    );

    const didExecute =
      data.didExecute === true ||
      data.executed === true;

    let compileCode;

    if (hasBuild) {
      compileCode = asNumber(build.code);

      if (compileCode === null) {
        compileCode = asNumber(build.exitCode);
      }
    } else {
      compileCode = asNumber(data.compilerCode);

      if (compileCode === null) {
        compileCode = asNumber(data.buildCode);
      }

      if (compileCode === null && !didExecute) {
        compileCode = asNumber(data.code);
      }

      if (compileCode === null && didExecute) {
        compileCode = 0;
      }
    }

    if (compileCode === null) {
      compileCode = 0;
    }

    let compilerStdout = "";
    let compilerStderr = "";
    let executionStdout = "";
    let executionStderr = "";
    let executionCode = null;

    if (hasBuild) {
      // Current response shape: compiler diagnostics live in buildResult.
      compilerStdout = textValue(build.stdout);
      compilerStderr = textValue(build.stderr);

      // Program output is separate from build diagnostics.
      if (didExecute) {
        executionStdout = textValue(data.stdout);
        executionStderr = textValue(data.stderr);
        executionCode = asNumber(data.code);
      }
    } else if (didExecute) {
      executionStdout = textValue(data.stdout);
      executionStderr = textValue(data.stderr);
      executionCode = asNumber(data.code);

      compilerStdout = textValue(data.compilerStdout);
      compilerStderr = textValue(data.compilerStderr);
    } else {
      // Legacy compile-only response shape.
      compilerStdout = textValue(data.stdout);
      compilerStderr = textValue(data.stderr);
    }

    // Compatibility with alternate response shapes.
    if (
      executionCode === null &&
      data.execResult &&
      typeof data.execResult === "object"
    ) {
      const exec = data.execResult;

      if (!executionStdout) {
        executionStdout = textValue(
          exec.stdout || exec.output || exec.out
        );
      }

      if (!executionStderr) {
        executionStderr = textValue(
          exec.stderr || exec.error || exec.err
        );
      }

      executionCode = asNumber(exec.code);

      if (executionCode === null) {
        executionCode = asNumber(exec.exitCode);
      }
    }

    if (
      hasBuild &&
      compileCode === 0 &&
      !didExecute &&
      executeRequested
    ) {
      // Build succeeded, but the service did not confirm execution.
      executionCode = null;
    }

    return {
      raw: data,
      compileCode: compileCode,
      compilerStdout: compilerStdout,
      compilerStderr: compilerStderr,
      executionStdout: executionStdout,
      executionStderr: executionStderr,
      executionCode: executionCode,
      didExecute: didExecute,
      asm: textValue(data.asm)
    };
  }

  async function compile(options) {
    const opts = options || {};

    const source = String(
      opts.source == null ? "" : opts.source
    );

    if (!source.trim()) {
      throw new Error(
        "Write some C++ code before compiling."
      );
    }

    const compilerId = String(
      opts.compilerId || ""
    ).trim();

    if (!compilerId) {
      throw new Error(
        "Choose an available C++ compiler first."
      );
    }

    const allowedStandards = [
      "c++98",
      "c++03",
      "c++11",
      "c++14",
      "c++17",
      "c++20",
      "c++23"
    ];

    const standard =
      allowedStandards.indexOf(String(opts.standard)) >= 0
        ? String(opts.standard)
        : "c++20";

    const libraries = Array.isArray(opts.libraries)
      ? opts.libraries
          .filter(function (item) {
            return item && item.id && item.version;
          })
          .map(function (item) {
            return {
              id: String(item.id),
              version: String(item.version)
            };
          })
      : [];

    const files = Array.isArray(opts.files)
      ? opts.files
          .filter(function (item) {
            return (
              item &&
              typeof item.filename === "string" &&
              item.filename &&
              typeof item.contents === "string"
            );
          })
          .map(function (item) {
            return {
              filename: item.filename,
              contents: item.contents
            };
          })
      : [];

    const execute = opts.execute !== false;

    const body = {
      source: source,
      lang: "c++",
      allowStoreCodeDebug: false,
      files: files,
      options: {
        userArguments:
          "-std=" + standard +
          " -Wall -Wextra -pedantic -fno-diagnostics-color",

        compilerOptions: {
          executorRequest: execute,
          skipAsm: true,
          overrides: []
        },

        filters: {
          execute: execute,
          binary: false,
          binaryObject: false,
          commentOnly: false,
          demangle: true,
          directives: false,
          intel: false,
          labels: false,
          libraryCode: false,
          trim: true,
          debugCalls: false
        },

        executeParameters: {
          args: [],
          stdin: String(
            opts.stdin == null ? "" : opts.stdin
          ),
          runtimeTools: []
        },

        tools: [],
        libraries: libraries
      }
    };

    emit("status", {
      phase: execute ? "compiling" : "checking",
      text: execute
        ? "Compiling and running with the selected compiler…"
        : "Checking C++ source with the selected compiler…"
    });

    const payload = await requestJSON(
      API_ROOT +
        "/compiler/" +
        encodeURIComponent(compilerId) +
        "/compile",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      },
      opts.timeoutMs || DEFAULT_TIMEOUT_MS
    );

    const result = normalizeCompileResponse(
      payload,
      execute
    );

    emit("result", {
      result: result,
      requestSummary: {
        compilerId: compilerId,
        standard: standard,
        sourceLength: source.length,
        extraFileCount: files.length,
        libraryCount: libraries.length
      }
    });

    return result;
  }

  function stop() {
    let stopped = 0;

    Array.from(activeRequests).forEach(function (controller) {
      try {
        controller.abort();
        stopped += 1;
      } catch (_) {
        // Continue attempting to cancel other active requests.
      }
    });

    emit("stopped", {
      text: stopped
        ? "Stopped waiting for the compiler response. A request already accepted by the remote service may finish there."
        : "No active compiler request to stop."
    });
  }

  global.CodeAcademyCppRuntime = Object.freeze({
    apiRoot: API_ROOT,

    on: function (listener) {
      if (typeof listener !== "function") {
        return function () {};
      }

      listeners.add(listener);

      return function () {
        listeners.delete(listener);
      };
    },

    getCompilers: getCompilers,
    getLibraries: getLibraries,
    getFormatters: getFormatters,
    compile: compile,
    format: format,
    stop: stop
  });
})(typeof window !== "undefined" ? window : globalThis);
