// Playwright error messages can contain complete request headers.
export function redactError(error, actors = {}) {
  let message = String(error?.message || error);
  const secrets = [
    ...Object.entries(process.env).filter(([key]) => /SECRET|PASSWORD|TOKEN|DATABASE_URL|PRIVATE_KEY/.test(key)).map(([, value]) => value),
    ...Object.values(actors).flatMap(actor => [actor.token, actor.password]),
  ].filter(value => typeof value === 'string' && value.length >= 4);
  for (const secret of secrets) message = message.split(secret).join('[REDACTED]');
  return message.replace(/((?:authorization|x-vercel-protection-bypass|cookie|set-cookie)\s*:\s*)[^\r\n]+/gi, '$1[REDACTED]');
}
