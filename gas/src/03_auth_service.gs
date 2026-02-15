/**
 * Service-to-service auth via shared API key.
 */

const AuthService_ = (() => {

  function authenticate_(auth) {
    const scriptProps = PropertiesService.getScriptProperties();
    const expectedApiKey = String(scriptProps.getProperty('GAS_API_KEY') || '').trim();
    if (!expectedApiKey) return null;

    const providedApiKey = String((auth && auth.api_key) || '').trim();
    if (!providedApiKey) return null;
    if (providedApiKey !== expectedApiKey) return null;

    return {
      id: 'service',
      role: ROLE.OWNER,
      name: 'service',
    };
  }

  return { authenticate_ };
})();
