import appleSignin from 'apple-signin-auth';

/**
 * Verify Apple ID token
 * @param {string} idToken - The identity token from Apple
 * @returns {Promise<Object>} - Decoded token data
 */
const verifyIdToken = async (idToken) => {
  try {
    const audiences = [
      process.env.APPLE_CLIENT_ID,
      'com.dadexpress.web',
      'com.dadexpress.in',
      'com.dadexpress.app',
      'com.dadexpress.ios',
      'com.dadexpress.customer',
      'com.dadexpress.service',
      'in.dadexpress.app',
      'in.dadexpress.ios'
    ].filter(Boolean);

    const tokenData = await appleSignin.verifyIdToken(idToken, {
      audience: audiences,
      ignoreExpiration: false,
    });

    return {
      uid: tokenData.sub,
      email: tokenData.email,
      emailVerified: tokenData.email_verified === 'true' || tokenData.email_verified === true
    };
  } catch (err) {
    console.error('Apple ID token verification failed:', err);
    throw new Error('Invalid Apple ID token');
  }
};

export default {
  verifyIdToken
};
