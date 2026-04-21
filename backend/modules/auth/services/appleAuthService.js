import appleSignin from 'apple-signin-auth';

/**
 * Verify Apple ID token
 * @param {string} idToken - The identity token from Apple
 * @returns {Promise<Object>} - Decoded token data
 */
const verifyIdToken = async (idToken) => {
  try {
    const clientID = process.env.APPLE_CLIENT_ID || 'dadexpress.in';
    
    const tokenData = await appleSignin.verifyIdToken(idToken, {
      audience: clientID,
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
