<?php
// Isolated MODX API fixture. All delivery is recorded locally, never sent.
$config = json_decode(file_get_contents(__DIR__ . '/config.json'), true);
class TestMail {
    public function set(...$args) {} public function address(...$args) {} public function setHTML(...$args) {} public function reset() {}
    public function send() {
        global $config;
        file_put_contents(__DIR__ . '/mail.jsonl', json_encode(['sent' => $config['email_success']]) . "\n", FILE_APPEND);
        if (!empty($config['fail_log_after_delivery'])) { mkdir($config['portfolio_assistant.log_path'] . '/' . gmdate('Y-m') . '-AILeadLogs.jsonl'); }
        return $config['email_success'];
    }
}
class TestModx {
    public function getOption($key, $options = null, $default = null) { global $config; return $config[$key] ?? $default; }
    public function getObject(...$args) { return new class { public function get($key) { return 'Test assistant rules'; } }; }
    public function getService(...$args) { return new TestMail; }
    public function log($level, $message) { file_put_contents(__DIR__ . '/errors.jsonl', json_encode($message) . "\n", FILE_APPEND); }
}
if ($realRoot = getenv('ASSISTANT_REAL_MODX_ROOT')) {
    // Use real MODX 2 / xPDO / modChunk / modMail classes and database context.
    // Never modify CMS settings or chunks; override test services in memory.
    require $realRoot . '/config.core.php';
    require MODX_CORE_PATH . 'model/modx/modx.class.php';
    class TestRuntimeModx extends modX {
        public function getObject($className, $criteria = null, $cacheFlag = true) {
            if ($className === 'modChunk' && ($criteria['name'] ?? '') === 'assistant_test_rules') {
                $chunk = $this->newObject('modChunk');
                $chunk->set('snippet', 'Test assistant rules');
                return $chunk;
            }
            return parent::getObject($className, $criteria, $cacheFlag);
        }
        public function log($level, $message, $target = '', $def = '', $file = '', $line = '') {
            if (str_starts_with($message, '[Portfolio Assistant]')) {
                file_put_contents(__DIR__ . '/errors.jsonl', json_encode($message) . "\n", FILE_APPEND);
            }
            return parent::log($level, $message, $target, $def, $file, $line);
        }
    }
    $modx = new TestRuntimeModx();
    $modx->initialize('web', ['session_enabled' => false]);
    $modx->setLogTarget(['target' => 'FILE', 'options' => ['filepath' => __DIR__ . '/', 'filename' => 'modx-error.log']]);
    foreach ($config as $key => $value) { $modx->setOption($key, $value); }
    $modx->setOption('portfolio_assistant.ai_rules', 'assistant_test_rules');
    $modx->loadClass('mail.modMail', '', false, true);
    $modx->services['mail'] = new TestMail;
} else {
define('MODX_CORE_PATH', __DIR__ . '/core/');
class modX { const LOG_LEVEL_ERROR = 3; }
class modMail {
    const MAIL_BODY = 'body', MAIL_FROM = 'from', MAIL_FROM_NAME = 'from_name', MAIL_SENDER = 'sender', MAIL_SUBJECT = 'subject';
}
    $modx = new TestModx;
}
