let transporter = null;

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

async function buildTransporter() {
  let nodemailer;
  try {
    const module = await import('nodemailer');
    nodemailer = module.default || module;
  } catch {
    throw new Error('nodemailer is not installed. Run: npm install --workspace=server');
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host) {
    throw new Error('SMTP_HOST is not configured');
  }
  if (!Number.isFinite(port)) {
    throw new Error('SMTP_PORT is invalid');
  }

  const options = {
    host,
    port,
    secure
  };

  if (user && pass) {
    options.auth = { user, pass };
  }

  return nodemailer.createTransport(options);
}

async function getTransporter() {
  if (!transporter) {
    transporter = await buildTransporter();
    await transporter.verify();
  }
  return transporter;
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function getStopLabel(stop) {
  if (typeof stop === 'string') return stop;
  if (!stop || typeof stop !== 'object') return '';

  const candidates = [
    stop.formattedAddress,
    stop.name,
    stop.original,
    stop.searchQuery
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng))) {
    return `${Number(stop.lat)},${Number(stop.lng)}`;
  }

  return '';
}

function getRouteStops(route) {
  if (!route || !Array.isArray(route.stops) || route.stops.length < 2) {
    throw new Error('Route must include at least 2 stops');
  }

  const labels = route.stops.map(getStopLabel).filter(Boolean);
  if (labels.length < 2) {
    throw new Error('Route stops are incomplete');
  }
  return labels;
}

export function buildGoogleMapsDirectionsLink(route) {
  const stopLabels = getRouteStops(route);
  const origin = stopLabels[0];
  const destination = stopLabels[stopLabels.length - 1];
  const waypoints = (route.stops || []).slice(1, -1).map((stop, i) => {
    const label = stopLabels[i + 1];
    return stop.via ? `via:${label}` : label;
  });

  const params = new URLSearchParams({
    api: '1',
    travelmode: 'driving',
    origin,
    destination
  });

  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.join('|'));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendRouteEmail({ toEmail, route }) {
  const email = String(toEmail || '').trim();
  if (!isValidEmail(email)) {
    throw new Error('A valid recipient email is required');
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from) {
    throw new Error('SMTP_FROM or SMTP_USER must be configured');
  }

  const stopLabels = getRouteStops(route);
  const mapsLink = buildGoogleMapsDirectionsLink(route);
  const subject = 'Your Route Is Ready In Google Maps';
  const distanceText = route?.totals?.distance?.text || 'N/A';
  const durationText = route?.totals?.duration?.text || 'N/A';

  const plainTextStops = stopLabels.map((stop, index) => `${index + 1}. ${stop}`).join('\n');
  const text = [
    'Your route is ready.',
    '',
    `Distance: ${distanceText}`,
    `Duration: ${durationText}`,
    '',
    'Open this link on your phone:',
    mapsLink,
    '',
    'Stops:',
    plainTextStops
  ].join('\n');

  const htmlStops = stopLabels
    .map((stop) => `<li>${escapeHtml(stop)}</li>`)
    .join('');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin-bottom: 8px;">Your route is ready</h2>
      <p style="margin: 0 0 8px 0;"><strong>Distance:</strong> ${escapeHtml(distanceText)}</p>
      <p style="margin: 0 0 16px 0;"><strong>Duration:</strong> ${escapeHtml(durationText)}</p>
      <p style="margin: 0 0 16px 0;">
        <a href="${escapeHtml(mapsLink)}" style="background: #2563eb; color: #fff; padding: 10px 14px; border-radius: 6px; text-decoration: none; display: inline-block;">
          Open Route In Google Maps
        </a>
      </p>
      <p style="margin: 0 0 6px 0;"><strong>Stops:</strong></p>
      <ol style="margin: 0; padding-left: 20px;">${htmlStops}</ol>
    </div>
  `;

  const mailer = await getTransporter();
  const info = await mailer.sendMail({
    from,
    to: email,
    subject,
    text,
    html
  });

  return {
    mapsLink,
    messageId: info.messageId
  };
}
