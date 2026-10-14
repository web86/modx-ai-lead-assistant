<?php
// Test-only session seeder for upgrades from the previous adapter.
session_name('portfolio_assistant');
session_start();
$_SESSION['portfolio_assistant_conversation'] = [
    'email' => 'visitor@example.test',
    'conversation_id' => 'legacy_conversation_01',
    'contact_logged_at' => time(),
    'first_request_logged_at' => time(),
    'history' => [['role' => 'user', 'content' => 'Legacy history'], ['role' => 'assistant', 'content' => 'Legacy reply']],
];
if (isset($_GET['delivered'])) {
    $_SESSION['portfolio_assistant_conversation']['handoff_sent_at'] = time();
    $_SESSION['portfolio_assistant_conversation']['handoff_channels'] = ['email' => true, 'telegram' => false];
    $_SESSION['portfolio_assistant_conversation']['final_message'] = 'Legacy delivered';
}
header('Content-Type: application/json');
echo json_encode(['ok' => true]);
