(function (root) {
  // Normalize only on submit/display, never rewrite an in-progress input.
  function normalize(value) {
    return String(value ?? "")
      .trim()
      .replace(/^@/, "")
      .toLocaleLowerCase("ru");
  }

  function isValid(value) {
    return /^[a-zа-яё0-9_-]{3,32}$/u.test(normalize(value));
  }

  function format(value) {
    const handle = normalize(value);
    return handle ? `@${handle}` : "";
  }

  const api = {
    normalize,
    isValid,
    format,
    errorMessage:
      "Username: от 3 до 32 символов — русские или латинские буквы, цифры, дефис (-) и подчёркивание (_).",
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MayakUsername = api;
})(typeof window !== "undefined" ? window : this);
