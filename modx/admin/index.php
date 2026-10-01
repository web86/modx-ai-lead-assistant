<?php

declare(strict_types=1);

$siteRoot = dirname(__DIR__, 4);

require_once $siteRoot . '/config.core.php';
require_once MODX_CORE_PATH . 'model/modx/modx.class.php';

$modx = new modX();
$modx->initialize('mgr');

if (
    !$modx->user
    || !$modx->user->hasSessionContext('mgr')
    || !(bool)$modx->user->get('sudo')
) {
    http_response_code(403);
    exit('<h2>Access denied</h2><p>Please sign in to MODX Manager as a sudo user.</p>');
}

function h($value): string
{
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function param(string $name): string
{
    return isset($_GET[$name]) ? trim((string)$_GET[$name]) : '';
}

function containsText(string $value, string $search): bool
{
    if ($search === '') {
        return true;
    }

    return mb_stripos($value, $search, 0, 'UTF-8') !== false;
}

$logPath = rtrim(
    trim((string)$modx->getOption(
        'portfolio_assistant.log_path',
        null,
        MODX_CORE_PATH . 'cache/logs/ai-lead-assistant'
    )),
    "/\\"
);

if ($logPath === '' || !is_dir($logPath)) {
    exit('<h2>AI Lead Log</h2><p>No lead log directory found yet.</p>');
}

$year = preg_replace('/[^0-9]/', '', param('year'));
$month = preg_replace('/[^0-9]/', '', param('month'));
$statusFilter = param('status');
$contactFilter = param('contact');
$requestFilter = param('request');
$searchFilter = param('q');

$files = glob($logPath . '/*-AILeadLogs.jsonl') ?: [];
sort($files);

$available = [];
$leads = [];

foreach ($files as $file) {
    $base = basename($file);

    if (!preg_match('/^(\d{4})-(\d{2})-AILeadLogs\.jsonl$/', $base, $matches)) {
        continue;
    }

    $fileYear = $matches[1];
    $fileMonth = $matches[2];
    $available[$fileYear][$fileMonth] = true;

    if ($year !== '' && $year !== $fileYear) {
        continue;
    }

    if ($month !== '' && $month !== $fileMonth) {
        continue;
    }

    $handle = fopen($file, 'rb');

    if (!$handle) {
        continue;
    }

    while (($line = fgets($handle)) !== false) {
        $row = json_decode(trim($line), true);

        if (!is_array($row)) {
            continue;
        }

        $id = trim((string)($row['conversation_id'] ?? ''));

        if ($id === '') {
            continue;
        }

        if (!isset($leads[$id])) {
            $leads[$id] = [
                'conversation_id' => $id,
                'datetime' => (string)($row['datetime'] ?? ''),
                'updated_at' => (string)($row['datetime'] ?? ''),
                'status' => 'contact',
                'email' => '',
                'first_request' => '',
                'name' => '',
                'website' => '',
                'request' => '',
                'summary' => '',
                'page_url' => '',
                'email_sent' => false,
                'telegram_sent' => false,
            ];
        }

        $lead = &$leads[$id];

        $lead['updated_at'] = (string)($row['datetime'] ?? $lead['updated_at']);
        $lead['email'] = (string)($row['email'] ?? $lead['email']);
        $lead['page_url'] = (string)($row['page_url'] ?? $lead['page_url']);

        $event = (string)($row['event'] ?? '');

        if ($event === 'first_request') {
            $lead['first_request'] = (string)($row['first_request'] ?? '');

            if ($lead['status'] === 'contact') {
                $lead['status'] = 'started';
            }
        }

        if ($event === 'handoff_failed') {
            $lead['status'] = 'failed';
        }

        if ($event === 'handoff_success') {
            $lead['status'] = 'sent';
        }

        if ($event === 'handoff_failed' || $event === 'handoff_success') {
            foreach (['name', 'website', 'request', 'summary'] as $key) {
                $lead[$key] = (string)($row[$key] ?? $lead[$key]);
            }

            $lead['email_sent'] = !empty($row['email_sent']);
            $lead['telegram_sent'] = !empty($row['telegram_sent']);
        }

        unset($lead);
    }

    fclose($handle);
}

$rows = array_values($leads);

$rows = array_values(array_filter(
    $rows,
    static function (array $row) use (
        $statusFilter,
        $contactFilter,
        $requestFilter,
        $searchFilter
    ): bool {
        if ($statusFilter !== '' && ($row['status'] ?? '') !== $statusFilter) {
            return false;
        }

        if (
            $contactFilter !== ''
            && !containsText(
                implode(' ', [
                    (string)($row['email'] ?? ''),
                    (string)($row['name'] ?? ''),
                    (string)($row['website'] ?? ''),
                ]),
                $contactFilter
            )
        ) {
            return false;
        }

        if (
            $requestFilter !== ''
            && !containsText(
                implode(' ', [
                    (string)($row['first_request'] ?? ''),
                    (string)($row['request'] ?? ''),
                    (string)($row['summary'] ?? ''),
                ]),
                $requestFilter
            )
        ) {
            return false;
        }

        if ($searchFilter !== '') {
            $all = implode(
                ' ',
                array_map(
                    static function ($value): string {
                        return is_scalar($value) ? (string)$value : '';
                    },
                    $row
                )
            );

            if (!containsText($all, $searchFilter)) {
                return false;
            }
        }

        return true;
    }
));

usort(
    $rows,
    static function (array $a, array $b): int {
        return strcmp(
            (string)($b['updated_at'] ?? ''),
            (string)($a['updated_at'] ?? '')
        );
    }
);

if (param('export') === 'csv') {
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="ai-leads-' . gmdate('Y-m-d') . '.csv"');

    $out = fopen('php://output', 'wb');
    fwrite($out, "\xEF\xBB\xBF");

    fputcsv($out, [
        'Created',
        'Updated',
        'Status',
        'Email',
        'First request',
        'Name',
        'Website',
        'Request',
        'Summary',
        'Page',
        'Email sent',
        'Telegram sent',
        'Conversation ID',
    ]);

    foreach ($rows as $row) {
        fputcsv($out, [
            $row['datetime'] ?? '',
            $row['updated_at'] ?? '',
            $row['status'] ?? '',
            $row['email'] ?? '',
            $row['first_request'] ?? '',
            $row['name'] ?? '',
            $row['website'] ?? '',
            $row['request'] ?? '',
            $row['summary'] ?? '',
            $row['page_url'] ?? '',
            !empty($row['email_sent']) ? 'yes' : 'no',
            !empty($row['telegram_sent']) ? 'yes' : 'no',
            $row['conversation_id'] ?? '',
        ]);
    }

    fclose($out);
    exit;
}

krsort($available);

$statusLabels = [
    'contact' => 'Contact only',
    'started' => 'Conversation started',
    'failed' => 'Handoff failed',
    'sent' => 'Sent',
];

$exportQuery = $_GET;
$exportQuery['export'] = 'csv';

?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Lead Log</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#f4f5f7;color:#2d3339;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px}.container{max-width:1800px;margin:auto}h1{margin:0 0 20px}.panel{background:#fff;border:1px solid #dfe3e8;border-radius:7px;padding:16px;margin-bottom:16px}.filters{display:grid;grid-template-columns:110px 110px 170px 220px 1fr 1fr 100px;gap:10px;align-items:end}.field label{display:block;margin-bottom:5px;color:#666;font-size:12px}input,select,button{width:100%;height:38px;border:1px solid #cfd5da;border-radius:4px;padding:0 10px;background:#fff}button{background:#3697cd;color:#fff;border-color:#3697cd;cursor:pointer}.actions{display:flex;gap:12px;margin-top:12px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;background:#fff}th,td{border-bottom:1px solid #e4e7ea;padding:10px 12px;vertical-align:top;text-align:left}th{background:#eef1f4;position:sticky;top:0}.wrap{max-width:320px;white-space:normal}.status{font-weight:700}.sent{color:#20833a}.failed{color:#b33232}.started{color:#8a6400}.contact{color:#666}@media(max-width:1100px){.filters{grid-template-columns:repeat(2,minmax(180px,1fr))}}
</style>
</head>
<body>
<div class="container">
<h1>AI Lead Log</h1>

<form class="panel" method="get">
<div class="filters">
<div class="field"><label>Year</label><select name="year"><option value="">All</option>
<?php foreach ($available as $y => $months): ?>
<option value="<?= h($y) ?>" <?= $year === (string)$y ? 'selected' : '' ?>><?= h($y) ?></option>
<?php endforeach; ?>
</select></div>

<div class="field"><label>Month</label><select name="month"><option value="">All</option>
<?php for ($i = 1; $i <= 12; $i++): $m = sprintf('%02d', $i); ?>
<option value="<?= h($m) ?>" <?= $month === $m ? 'selected' : '' ?>><?= h($m) ?></option>
<?php endfor; ?>
</select></div>

<div class="field"><label>Status</label><select name="status"><option value="">All</option>
<?php foreach ($statusLabels as $key => $label): ?>
<option value="<?= h($key) ?>" <?= $statusFilter === $key ? 'selected' : '' ?>><?= h($label) ?></option>
<?php endforeach; ?>
</select></div>

<div class="field"><label>Contact</label><input name="contact" value="<?= h($contactFilter) ?>" placeholder="email / name / website"></div>
<div class="field"><label>Request</label><input name="request" value="<?= h($requestFilter) ?>" placeholder="first request / summary"></div>
<div class="field"><label>Search</label><input name="q" value="<?= h($searchFilter) ?>"></div>
<div class="field"><label>&nbsp;</label><button type="submit">Filter</button></div>
</div>

<div class="actions">
<a href="?">Reset filters</a>
<a href="?<?= h(http_build_query($exportQuery)) ?>">Export CSV</a>
</div>
</form>

<div class="panel"><strong><?= count($rows) ?></strong> leads found.</div>

<div class="panel table-wrap">
<table>
<thead>
<tr>
<th>Date</th><th>Status</th><th>Email</th><th>First request</th><th>Lead</th><th>Summary</th><th>Channels</th><th>Page</th>
</tr>
</thead>
<tbody>
<?php if (!$rows): ?><tr><td colspan="8">No records found.</td></tr><?php endif; ?>
<?php foreach ($rows as $row): ?>
<tr>
<td><?= h($row['updated_at'] ?? '') ?></td>
<td class="status <?= h($row['status'] ?? '') ?>"><?= h($statusLabels[$row['status']] ?? $row['status']) ?></td>
<td><?= h($row['email'] ?? '') ?></td>
<td class="wrap"><?= h($row['first_request'] ?? '') ?></td>
<td class="wrap"><strong><?= h($row['name'] ?? '') ?></strong><br><?= h($row['website'] ?? '') ?><br><?= h($row['request'] ?? '') ?></td>
<td class="wrap"><?= h($row['summary'] ?? '') ?></td>
<td>Email: <?= !empty($row['email_sent']) ? '✓' : '—' ?><br>Telegram: <?= !empty($row['telegram_sent']) ? '✓' : '—' ?></td>
<td class="wrap"><?php if (!empty($row['page_url'])): ?><a href="<?= h($row['page_url']) ?>" target="_blank" rel="noopener"><?= h($row['page_url']) ?></a><?php endif; ?></td>
</tr>
<?php endforeach; ?>
</tbody>
</table>
</div>
</div>
</body>
</html>
