<?php
$config = json_decode(file_get_contents(__DIR__ . '/config.json'), true);
$payload = json_decode(file_get_contents('php://input'), true);
file_put_contents(__DIR__ . '/gateway.jsonl', json_encode(['path' => $_SERVER['REQUEST_URI'], 'payload' => $payload]) . "\n", FILE_APPEND);
header('Content-Type: application/json');
if ($_SERVER['REQUEST_URI'] === '/telegram') {
    echo json_encode(['ok' => $config['telegram_success']]);
} else {
    $message = end($payload['input'])['content'];
    echo json_encode(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode([
        'reply' => 'Tell me more.', 'ready_to_handoff' => str_starts_with($message, 'send'),
        'handoff_message' => 'Delivered to the owner.', 'lead' => ['name' => null, 'website' => null, 'request' => $message, 'summary' => 'Test request']
    ])]]]]]);
}
