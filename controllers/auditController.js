const OverrideLog = require('../models/overrideLogModel');
const Event = require('../models/eventModel');

async function index(req, res, next) {
  try {
    const eventId = req.query.event_id || '';
    const [events, logs] = await Promise.all([
      Event.all(),
      OverrideLog.all(eventId ? { event_id: eventId } : {})
    ]);

    res.render('audit/overrides', {
      title: 'Override Audit Log',
      events,
      logs,
      selectedEvent: eventId
    });
  } catch (error) {
    next(error);
  }
}

async function exportCsv(req, res, next) {
  try {
    const eventId = req.query.event_id || '';
    const logs = await OverrideLog.all(eventId ? { event_id: eventId } : {});

    const header = [
      'created_at',
      'event_name',
      'override_type',
      'meron_owner_name',
      'wala_owner_name',
      'meron_weight',
      'wala_weight',
      'weight_difference',
      'meron_type',
      'wala_type',
      'give_take_grams',
      'session_id',
      'ip_address'
    ];

    const lines = [header.join(',')];
    for (const log of logs) {
      lines.push([
        log.created_at?.toISOString?.() || log.created_at,
        csvEscape(log.event_name),
        log.override_type,
        csvEscape(log.meron_owner_name),
        csvEscape(log.wala_owner_name),
        log.meron_weight,
        log.wala_weight,
        log.weight_difference,
        log.meron_type,
        log.wala_type,
        log.give_take_grams,
        csvEscape(log.session_id),
        csvEscape(log.ip_address)
      ].join(','));
    }

    const filename = eventId ? `override-logs-event-${eventId}.csv` : 'override-logs.csv';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(`${lines.join('\n')}\n`);
  } catch (error) {
    next(error);
  }
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

module.exports = { index, exportCsv };
