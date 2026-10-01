<?php

if (!defined('ABSPATH')) {
    exit;
}

function web86_ai_lead_viewer_collect(array $settings): array
{
    $dir = web86_ai_lead_log_dir($settings);

    if ($dir === '' || !is_dir($dir)) {
        return [];
    }

    $files = glob($dir . '/*-AILeadLogs.jsonl') ?: [];
    sort($files);

    $year = isset($_GET['year']) ? preg_replace('/[^0-9]/', '', (string)$_GET['year']) : '';
    $month = isset($_GET['month']) ? preg_replace('/[^0-9]/', '', (string)$_GET['month']) : '';

    $leads = [];

    foreach ($files as $file) {
        $base = basename($file);

        if (!preg_match('/^(\d{4})-(\d{2})-AILeadLogs\.jsonl$/', $base, $m)) {
            continue;
        }

        if ($year !== '' && $year !== $m[1]) {
            continue;
        }

        if ($month !== '' && $month !== $m[2]) {
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

    return array_values($leads);
}

function web86_ai_lead_viewer_contains(string $value, string $search): bool
{
    if ($search === '') {
        return true;
    }

    return mb_stripos($value, $search, 0, 'UTF-8') !== false;
}

function web86_ai_lead_render_logs(): void
{
    if (!current_user_can('manage_options')) {
        wp_die('Access denied.');
    }

    $settings = web86_ai_lead_settings();
    $rows = web86_ai_lead_viewer_collect($settings);

    $status = sanitize_text_field((string)($_GET['status'] ?? ''));
    $contact = sanitize_text_field((string)($_GET['contact'] ?? ''));
    $request = sanitize_text_field((string)($_GET['request'] ?? ''));
    $q = sanitize_text_field((string)($_GET['q'] ?? ''));

    $rows = array_values(array_filter(
        $rows,
        static function (array $row) use ($status, $contact, $request, $q): bool {
            if ($status !== '' && ($row['status'] ?? '') !== $status) {
                return false;
            }

            if ($contact !== '' && !web86_ai_lead_viewer_contains(
                implode(' ', [
                    (string)($row['email'] ?? ''),
                    (string)($row['name'] ?? ''),
                    (string)($row['website'] ?? ''),
                ]),
                $contact
            )) {
                return false;
            }

            if ($request !== '' && !web86_ai_lead_viewer_contains(
                implode(' ', [
                    (string)($row['first_request'] ?? ''),
                    (string)($row['request'] ?? ''),
                    (string)($row['summary'] ?? ''),
                ]),
                $request
            )) {
                return false;
            }

            if ($q !== '' && !web86_ai_lead_viewer_contains(
                implode(' ', array_map(
                    static fn($value): string => is_scalar($value) ? (string)$value : '',
                    $row
                )),
                $q
            )) {
                return false;
            }

            return true;
        }
    ));

    usort(
        $rows,
        static fn(array $a, array $b): int =>
            strcmp((string)($b['updated_at'] ?? ''), (string)($a['updated_at'] ?? ''))
    );

    $years = [];
    $dir = web86_ai_lead_log_dir($settings);
    foreach (glob($dir . '/*-AILeadLogs.jsonl') ?: [] as $file) {
        if (preg_match('/^(\d{4})-(\d{2})-AILeadLogs\.jsonl$/', basename($file), $m)) {
            $years[$m[1]][$m[2]] = true;
        }
    }
    krsort($years);

    $statusLabels = [
        'contact' => 'Contact only',
        'started' => 'Conversation started',
        'failed' => 'Handoff failed',
        'sent' => 'Sent',
    ];

    ?>
    <div class="wrap">
        <h1>AI Lead Log</h1>

        <form method="get" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:18px 0;">
            <input type="hidden" name="page" value="web86-ai-lead-logs">

            <label>Year<br>
                <select name="year">
                    <option value="">All</option>
                    <?php foreach ($years as $y => $months): ?>
                        <option value="<?php echo esc_attr($y); ?>" <?php selected((string)($_GET['year'] ?? ''), $y); ?>>
                            <?php echo esc_html($y); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </label>

            <label>Month<br>
                <select name="month">
                    <option value="">All</option>
                    <?php for ($i = 1; $i <= 12; $i++): $m = sprintf('%02d', $i); ?>
                        <option value="<?php echo esc_attr($m); ?>" <?php selected((string)($_GET['month'] ?? ''), $m); ?>>
                            <?php echo esc_html($m); ?>
                        </option>
                    <?php endfor; ?>
                </select>
            </label>

            <label>Status<br>
                <select name="status">
                    <option value="">All</option>
                    <?php foreach ($statusLabels as $key => $label): ?>
                        <option value="<?php echo esc_attr($key); ?>" <?php selected($status, $key); ?>>
                            <?php echo esc_html($label); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </label>

            <label>Contact<br>
                <input type="text" name="contact" value="<?php echo esc_attr($contact); ?>" placeholder="email / name / website">
            </label>

            <label>Request<br>
                <input type="text" name="request" value="<?php echo esc_attr($request); ?>" placeholder="first request / summary">
            </label>

            <label>Search<br>
                <input type="text" name="q" value="<?php echo esc_attr($q); ?>">
            </label>

            <button class="button button-primary">Filter</button>
            <a class="button" href="<?php echo esc_url(admin_url('tools.php?page=web86-ai-lead-logs')); ?>">Reset</a>
            <?php
            $exportQuery = $_GET;
            $exportQuery['page'] = 'web86-ai-lead-logs';
            $exportQuery['export'] = 'csv';
            ?>
            <a class="button" href="<?php echo esc_url(add_query_arg($exportQuery, admin_url('tools.php'))); ?>">Export CSV</a>
        </form>

        <p><strong><?php echo count($rows); ?></strong> leads found.</p>

        <div style="overflow:auto">
            <table class="widefat striped">
                <thead>
                <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Email</th>
                    <th>First request</th>
                    <th>Lead</th>
                    <th>Summary</th>
                    <th>Channels</th>
                    <th>Page</th>
                </tr>
                </thead>
                <tbody>
                <?php if (!$rows): ?>
                    <tr><td colspan="8">No records found.</td></tr>
                <?php endif; ?>

                <?php foreach ($rows as $row): ?>
                    <tr>
                        <td><?php echo esc_html((string)($row['updated_at'] ?? '')); ?></td>
                        <td><strong><?php echo esc_html($statusLabels[$row['status']] ?? $row['status']); ?></strong></td>
                        <td><?php echo esc_html((string)($row['email'] ?? '')); ?></td>
                        <td style="max-width:280px;white-space:normal"><?php echo esc_html((string)($row['first_request'] ?? '')); ?></td>
                        <td style="max-width:260px;white-space:normal">
                            <strong><?php echo esc_html((string)($row['name'] ?? '')); ?></strong><br>
                            <?php echo esc_html((string)($row['website'] ?? '')); ?><br>
                            <?php echo esc_html((string)($row['request'] ?? '')); ?>
                        </td>
                        <td style="max-width:340px;white-space:normal"><?php echo esc_html((string)($row['summary'] ?? '')); ?></td>
                        <td>
                            Email: <?php echo !empty($row['email_sent']) ? '✓' : '—'; ?><br>
                            Telegram: <?php echo !empty($row['telegram_sent']) ? '✓' : '—'; ?>
                        </td>
                        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis">
                            <?php if (!empty($row['page_url'])): ?>
                                <a href="<?php echo esc_url($row['page_url']); ?>" target="_blank" rel="noopener">
                                    <?php echo esc_html($row['page_url']); ?>
                                </a>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
    <?php
}

add_action('admin_init', static function (): void {
    if (
        !is_admin()
        || (string)($_GET['page'] ?? '') !== 'web86-ai-lead-logs'
        || (string)($_GET['export'] ?? '') !== 'csv'
    ) {
        return;
    }

    if (!current_user_can('manage_options')) {
        wp_die('Access denied.');
    }

    $settings = web86_ai_lead_settings();
    $rows = web86_ai_lead_viewer_collect($settings);

    $status = sanitize_text_field((string)($_GET['status'] ?? ''));
    $contact = sanitize_text_field((string)($_GET['contact'] ?? ''));
    $request = sanitize_text_field((string)($_GET['request'] ?? ''));
    $q = sanitize_text_field((string)($_GET['q'] ?? ''));

    $rows = array_values(array_filter(
        $rows,
        static function (array $row) use ($status, $contact, $request, $q): bool {
            if ($status !== '' && ($row['status'] ?? '') !== $status) {
                return false;
            }

            if ($contact !== '' && !web86_ai_lead_viewer_contains(
                implode(' ', [
                    (string)($row['email'] ?? ''),
                    (string)($row['name'] ?? ''),
                    (string)($row['website'] ?? ''),
                ]),
                $contact
            )) {
                return false;
            }

            if ($request !== '' && !web86_ai_lead_viewer_contains(
                implode(' ', [
                    (string)($row['first_request'] ?? ''),
                    (string)($row['request'] ?? ''),
                    (string)($row['summary'] ?? ''),
                ]),
                $request
            )) {
                return false;
            }

            if ($q !== '' && !web86_ai_lead_viewer_contains(
                implode(' ', array_map(
                    static fn($value): string => is_scalar($value) ? (string)$value : '',
                    $row
                )),
                $q
            )) {
                return false;
            }

            return true;
        }
    ));

    usort(
        $rows,
        static fn(array $a, array $b): int =>
            strcmp((string)($b['updated_at'] ?? ''), (string)($a['updated_at'] ?? ''))
    );

    nocache_headers();
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="ai-leads-' . gmdate('Y-m-d') . '.csv"');

    $out = fopen('php://output', 'wb');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, [
        'Created', 'Updated', 'Status', 'Email', 'First request',
        'Name', 'Website', 'Request', 'Summary', 'Page',
        'Email sent', 'Telegram sent', 'Conversation ID'
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
});

add_action('admin_menu', static function (): void {
    add_management_page(
        'AI Lead Log',
        'AI Lead Log',
        'manage_options',
        'web86-ai-lead-logs',
        'web86_ai_lead_render_logs'
    );
});
