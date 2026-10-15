
/*
 * CODE ACADEMY — PYTHON RUNTIME & PACKAGE MANAGER
 * Pyodide browser runtime.
 *
 * Features:
 * - Lazy Python runtime loading
 * - Curated Pyodide package registry
 * - Package installation with useful error messages
 * - Python execution and syntax checking
 * - Output and error reporting
 * - Compatible with PythonEditor.html API
 *
 * IMPORTANT:
 * This runs Python in the browser. It is not a full
 * desktop Python installation.
 */

(function (global) {
  "use strict";

  if (global.CodeAcademyPythonRuntime) return;

  // Keep this version aligned with your existing editor.
  const PYODIDE_BASE =
    "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/";

  /*
   * These packages are shipped by Pyodide.
   * Their package identifiers are used with loadPackage().
   * They are loaded only when requested or imported.
   */
  const BUILTIN_PACKAGES = {
    numpy: ["numpy"],
    pandas: ["pandas"],
    matplotlib: ["matplotlib"],
    scipy: ["scipy"],
    sklearn: ["scikit-learn"],
    "scikit-learn": ["scikit-learn"],
    sympy: ["sympy"],
    requests: ["requests"],
    bs4: ["beautifulsoup4"],
    beautifulsoup4: ["beautifulsoup4"],
    PIL: ["pillow"],
    pillow: ["pillow"],
    networkx: ["networkx"],
    cv2: ["opencv-python"],
    "opencv-python": ["opencv-python"],
    statsmodels: ["statsmodels"],
    seaborn: ["seaborn"],
    altair: ["altair"],
    bokeh: ["bokeh"],
    lxml: ["lxml"],
    yaml: ["pyyaml"],
    pyyaml: ["pyyaml"],
    regex: ["regex"],
    symengine: ["symengine"],
    jsonschema: ["jsonschema"],
    httpx: ["httpx"],
    aiohttp: ["aiohttp"],
    sqlalchemy: ["sqlalchemy"],
    dateutil: ["python-dateutil"],
    "python-dateutil": ["python-dateutil"],
    pytz: ["pytz"],
    joblib: ["joblib"],
    nltk: ["nltk"],
    skimage: ["scikit-image"],
    "scikit-image": ["scikit-image"],
    h5py: ["h5py"],
    imageio: ["imageio"],
    rich: ["rich"],
    tqdm: ["tqdm"],
    tabulate: ["tabulate"],
    toml: ["tomli"],
    tomli: ["tomli"],
    openpyxl: ["openpyxl"],
    xarray: ["xarray"],
    polars: ["polars"],
    pyarrow: ["pyarrow"],
    traitlets: ["traitlets"],
    ipython: ["ipython"],
    sympy: ["sympy"],
    mpmath: ["mpmath"],
    packaging: ["packaging"],
    beautifulsoup: ["beautifulsoup4"]
  };

  /*
   * Import names do not always match package names.
   * This map helps automatic import detection.
   */
  const IMPORT_ALIASES = {
    PIL: "pillow",
    bs4: "beautifulsoup4",
    cv2: "opencv-python",
    sklearn: "scikit-learn",
    skimage: "scikit-image",
    yaml: "pyyaml",
    dateutil: "python-dateutil"
  };

  const events = new Set();

  let pyodide = null;
  let loadPromise = null;
  let busy = false;
  let stopped = false;
  let outputBuffer = [];
  let errorBuffer = [];
  let loaded = new Set();

  function emit(type, data) {
    const message = Object.assign({ type: type }, data || {});

    events.forEach(function (callback) {
      try {
        callback(message);
      } catch (error) {
        console.error("Runtime event listener error:", error);
      }
    });

    try {
      global.dispatchEvent(
        new CustomEvent("codeacademy:python-runtime", {
          detail: message
        })
      );
    } catch (_) {}
  }

  function messageOf(error) {
    return String(
      error && (error.message || error.stack)
        ? error.message || error.stack
        : error
    );
  }

  function setStatus(text, phase) {
    emit("status", {
      text: text,
      phase: phase || "working"
    });
  }

  function normalizeName(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-");
  }

  function packageForImport(importName) {
    const name = String(importName || "").trim();

    if (IMPORT_ALIASES[name]) {
      return IMPORT_ALIASES[name];
    }

    const lower = normalizeName(name);

    if (BUILTIN_PACKAGES[lower]) {
      return lower;
    }

    if (BUILTIN_PACKAGES[name]) {
      return name;
    }

    return null;
  }

  function setupOutput() {
    if (!pyodide) return;

    pyodide.setStdout({
      batched: function (text) {
        if (!text) return;
        outputBuffer.push(text);
        emit("stdout", { text: text });
      }
    });

    pyodide.setStderr({
      batched: function (text) {
        if (!text) return;
        errorBuffer.push(text);
        emit("stderr", { text: text });
      }
    });
  }

  async function ensureRuntime() {
    if (pyodide) return pyodide;
    if (loadPromise) return loadPromise;

    stopped = false;

    loadPromise = (async function () {
      setStatus("Downloading Python runtime...", "downloading");

      try {
        const moduleUrl = PYODIDE_BASE + "pyodide.mjs";
        const module = await import(moduleUrl);

        if (typeof module.loadPyodide !== "function") {
          throw new Error(
            "The downloaded module does not expose loadPyodide()."
          );
        }

        pyodide = await module.loadPyodide({
          indexURL: PYODIDE_BASE
        });

        setupOutput();

        setStatus("Python runtime is ready.", "ready");

        emit("ready", {
          text: "Python is ready.",
          version: pyodide.version || "unknown"
        });

        return pyodide;
      } catch (error) {
        pyodide = null;

        throw new Error(
          "Could not load Pyodide. Check the internet connection, " +
          "CDN URL, browser console, and network permissions. Details: " +
          messageOf(error)
        );
      } finally {
        loadPromise = null;
      }
    })();

    return loadPromise;
  }

  /*
   * Install packages that are included with Pyodide.
   * This is preferred for compiled packages such as NumPy.
   */
  async function loadBuiltins(names) {
    const runtime = await ensureRuntime();
    const requested = [];
    const unknown = [];

    names.forEach(function (name) {
      const key = normalizeName(name);
      const entry = BUILTIN_PACKAGES[key] ||
        BUILTIN_PACKAGES[name];

      if (!entry) {
        unknown.push(name);
        return;
      }

      entry.forEach(function (packageName) {
        if (!loaded.has(packageName)) {
          requested.push(packageName);
        }
      });
    });

    const unique = Array.from(new Set(requested));

    if (unique.length) {
      setStatus(
        "Loading package(s): " + unique.join(", "),
        "packages"
      );

      try {
        await runtime.loadPackage(unique);

        unique.forEach(function (name) {
          loaded.add(name);
        });

        emit("packagesLoaded", {
          packages: unique
        });
      } catch (error) {
        throw new Error(
          "Pyodide could not load package(s): " +
          unique.join(", ") +
          ". These packages must exist in the selected Pyodide " +
          "distribution. Check your network connection and CDN access. " +
          "Original error: " + messageOf(error)
        );
      }
    }

    return {
      loaded: unique,
      unknown: unknown
    };
  }

  /*
   * Detect common imports in source code.
   * Explicit package installation is available for imports
   * that cannot be identified automatically.
   */
  function detectPackages(code) {
    const found = new Set();
    const source = String(code || "");

    const pattern =
      /^\s*(?:import\s+([A-Za-z_][A-Za-z0-9_.]*)|from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import\b)/gm;

    let match;

    while ((match = pattern.exec(source)) !== null) {
      const importName = (match[1] || match[2] || "")
        .split(".")[0];

      const packageName = packageForImport(importName);

      if (packageName) {
        found.add(packageName);
      }
    }

    return Array.from(found);
  }

  async function prepareImports(code) {
    const packages = detectPackages(code);

    if (!packages.length) return [];

    const result = await loadBuiltins(packages);

    if (result.unknown.length) {
      emit("warning", {
        text:
          "Some imports are not in the built-in registry: " +
          result.unknown.join(", ") +
          ". Install a compatible package separately if needed."
      });
    }

    return result.loaded;
  }

  /*
   * micropip supports pure-Python wheels and compatible wheels.
   * It cannot make arbitrary native desktop packages work
   * inside a browser.
   */
  async function installExtraPackage(packageName) {
    const runtime = await ensureRuntime();
    const name = normalizeName(packageName);

    if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(name)) {
      throw new Error("Enter a valid package name.");
    }

    if (BUILTIN_PACKAGES[name]) {
      await loadBuiltins([name]);

      return {
        type: "installed",
        packageName: name,
        source: "Pyodide"
      };
    }

    setStatus("Preparing micropip installer...", "installing");

    try {
      await runtime.loadPackage("micropip");

      runtime.globals.set("__ca_package_name", name);

      try {
        await runtime.runPythonAsync(
          "import micropip\n" +
          "await micropip.install(__ca_package_name)\n"
        );
      } finally {
        try {
          runtime.globals.delete("__ca_package_name");
        } catch (_) {}
      }

      emit("installed", {
        packageName: name,
        source: "micropip"
      });

      return {
        type: "installed",
        packageName: name,
        source: "micropip"
      };
    } catch (error) {
      throw new Error(
        "Could not install '" + name + "'. This usually means " +
        "the package has no compatible browser wheel, one of its " +
        "dependencies is unavailable, or the network request failed. " +
        "Try a package included with Pyodide or check the package's " +
        "browser compatibility. Details: " + messageOf(error)
      );
    }
  }

  const api = {
    version: "Code Academy Python Runtime 2.0",
    pyodideRoot: PYODIDE_BASE,

    get isReady() {
      return !!pyodide;
    },

    get isBusy() {
      return busy;
    },

    get loadedPackages() {
      return Array.from(loaded);
    },

    get packageRegistry() {
      return Object.keys(BUILTIN_PACKAGES).sort();
    },

    on: function (callback) {
      if (typeof callback !== "function") {
        return function () {};
      }

      events.add(callback);

      return function () {
        events.delete(callback);
      };
    },

    warmup: async function () {
      await ensureRuntime();

      return {
        type: "ready",
        text: "Python runtime is ready."
      };
    },

    loadPackage: async function (name) {
      const result = await loadBuiltins([name]);

      if (result.unknown.length) {
        throw new Error(
          "'" + name + "' is not in the built-in package registry. " +
          "Use installPackage() for an additional compatible package."
        );
      }

      return result;
    },

    installPackage: async function (name) {
      if (busy) {
        throw new Error(
          "Wait until the current Python program finishes before installing packages."
        );
      }

      return installExtraPackage(name);
    },

    check: async function (code, filename) {
      const runtime = await ensureRuntime();

      runtime.globals.set("__ca_check_source", String(code || ""));
      runtime.globals.set(
        "__ca_check_filename",
        String(filename || "main.py")
      );

      try {
        runtime.runPython(
          "compile(__ca_check_source, __ca_check_filename, 'exec')"
        );

        return {
          type: "checked",
          ok: true,
          text: "Python syntax is valid."
        };
      } catch (error) {
        return {
          type: "checked",
          ok: false,
          text: messageOf(error)
        };
      } finally {
        try {
          runtime.globals.delete("__ca_check_source");
          runtime.globals.delete("__ca_check_filename");
        } catch (_) {}
      }
    },

    run: async function (code, options) {
      options = options || {};

      if (busy) {
        throw new Error("Python is already running.");
      }

      const source = String(code || "");

      if (!source.trim()) {
        throw new Error("Write Python code before running it.");
      }

      busy = true;
      outputBuffer = [];
      errorBuffer = [];

      try {
        const runtime = await ensureRuntime();

        setupOutput();

        await prepareImports(source);

        setStatus("Running Python code...", "running");

        const result = await runtime.runPythonAsync(source);

        let resultText = "";

        if (result !== undefined && result !== null) {
          try {
            resultText = String(result);
          } catch (_) {
            resultText = "";
          }

          try {
            if (result && typeof result.destroy === "function") {
              result.destroy();
            }
          } catch (_) {}
        }

        const response = {
          type: "done",
          resultText: resultText,
          stdout: outputBuffer.join(""),
          stderr: errorBuffer.join("")
        };

        emit("done", response);

        return response;
      } catch (error) {
        const message = messageOf(error);

        emit("taskError", {
          text: message,
          phase: "run"
        });

        throw new Error(message);
      } finally {
        busy = false;
      }
    },

    stop: function () {
      /*
       * This runtime runs in the main thread.
       * JavaScript cannot forcibly interrupt a synchronous Python
       * operation here. Reloading destroys the runtime, so this
       * method reports the limitation instead of pretending to stop.
       */
      emit("warning", {
        text:
          "This runtime runs in the main thread and cannot safely " +
          "interrupt code that is already executing."
      });

      return false;
    }
  };

  global.CodeAcademyPythonRuntime = api;

  // Warm up the interpreter without preloading every package.
  function beginWarmup() {
    api.warmup().catch(function (error) {
      emit("warmupError", {
        text: messageOf(error)
      });
    });
  }

  if ("requestIdleCallback" in global) {
    global.requestIdleCallback(beginWarmup, { timeout: 2000 });
  } else {
    global.setTimeout(beginWarmup, 500);
  }
})(window);
