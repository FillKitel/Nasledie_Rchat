(function (root) {
  // Keep request ordering independent of the UI; aborted requests may still finish.
  function createSearch({ search, onChange, delay = 250 }) {
    let revision = 0;
    let timer;
    let controller;
    let state = { status: "idle", query: "", users: [], error: null };

    function setQuery(value, { immediate = false } = {}) {
      const query = String(value || "")
        .trim()
        .replace(/^@+/, "")
        .slice(0, 60);
      const current = ++revision;
      clearTimeout(timer);
      controller?.abort();
      state = {
        status: query.length < 2 ? "idle" : "loading",
        query,
        users: [],
        error: null,
      };
      onChange(state);
      if (state.status === "idle") return;
      controller = new AbortController();
      const { signal } = controller;
      const run = async () => {
        try {
          const users = await search(query, signal);
          if (current !== revision) return;
          state = { status: "ready", query, users, error: null };
        } catch (error) {
          if (current !== revision) return;
          state = { status: "error", query, users: [], error };
        }
        onChange(state);
      };
      if (immediate) void run();
      else timer = setTimeout(run, delay);
    }

    return {
      setQuery,
      reset: () => setQuery(""),
      retry: () => setQuery(state.query, { immediate: true }),
      getState: () => state,
    };
  }

  const api = { createSearch };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MayakUserSearch = api;
})(typeof window !== "undefined" ? window : this);
