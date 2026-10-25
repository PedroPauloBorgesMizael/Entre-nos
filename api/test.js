export default function handler(req, res) {
  const envSummary = {};
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith('ADMIN') ||
      key.startsWith('DATABASE') ||
      key.startsWith('APP') ||
      key.startsWith('RESEND') ||
      key.startsWith('VERCEL')
    ) {
      envSummary[key] = {
        exists: true,
        length: process.env[key] ? process.env[key].length : 0,
      };
    }
  }

  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.status(200).json({
    status: 'ok',
    message: 'Serverless function básica ativa na Vercel',
    nodeVersion: process.version,
    envKeys: envSummary,
  });
}
