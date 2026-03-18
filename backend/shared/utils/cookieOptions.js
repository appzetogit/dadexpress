const normalizeSameSite = (value) => {
  const candidate = String(value || "").toLowerCase().trim();
  if (candidate === "strict" || candidate === "none" || candidate === "lax") {
    return candidate;
  }
  return "lax";
};

const normalizeCookieDomain = (value) => {
  const candidate = String(value || "").trim();
  if (!candidate) return undefined;
  return candidate.startsWith(".") ? candidate : `.${candidate}`;
};

export const getRefreshCookieOptions = ({ maxAge } = {}) => {
  const isProduction = process.env.NODE_ENV === "production";
  let sameSite = normalizeSameSite(process.env.COOKIE_SAME_SITE || "lax");
  const secure = isProduction;

  // Browsers reject SameSite=None cookies unless Secure is true.
  if (sameSite === "none" && !secure) {
    sameSite = "lax";
  }

  const options = {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
  };

  const domain = normalizeCookieDomain(process.env.COOKIE_DOMAIN);
  if (domain) {
    options.domain = domain;
  }

  if (typeof maxAge === "number") {
    options.maxAge = maxAge;
  }

  return options;
};

export default {
  getRefreshCookieOptions,
};
