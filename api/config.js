module.exports = function(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '', googleCalendarClientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || '', googleOcr: Boolean(process.env.GOOGLE_VISION_API_KEY), analysis: Boolean(process.env.OPENROUTER_API_KEY) });
};
