-- Link with the betting station (same server). Run once on existing databases:
--   docker exec -i sabong-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" matching_db' < sql/007_betting_bridge.sql
-- Safe to run again.
USE matching_db;

DROP PROCEDURE IF EXISTS bridge_add_column;
DELIMITER $$
CREATE PROCEDURE bridge_add_column(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col) THEN
    SET @ddl = CONCAT('ALTER TABLE ', tbl, ' ADD COLUMN ', ddl);
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- Where the fight is on the betting side: none → called → open → closed → finished (or held / cancelled).
CALL bridge_add_column('matches', 'bet_state', "bet_state ENUM('none','called','open','closed','held','finished','cancelled') NOT NULL DEFAULT 'none' AFTER tv_meron_chicken_id");
CALL bridge_add_column('matches', 'called_at', 'called_at DATETIME NULL AFTER bet_state');
CALL bridge_add_column('matches', 'call_version', 'call_version INT NOT NULL DEFAULT 0 AFTER called_at');
-- The chicken that is MERON on the betting side (fixed when the fight is called).
CALL bridge_add_column('matches', 'called_meron_chicken_id', 'called_meron_chicken_id INT NULL AFTER call_version');
CALL bridge_add_column('matches', 'bet_hold_reason', 'bet_hold_reason VARCHAR(255) NULL AFTER called_meron_chicken_id');
CALL bridge_add_column('matches', 'bet_meron_odds', 'bet_meron_odds DECIMAL(8,2) NULL AFTER bet_hold_reason');
CALL bridge_add_column('matches', 'bet_wala_odds', 'bet_wala_odds DECIMAL(8,2) NULL AFTER bet_meron_odds');
CALL bridge_add_column('matches', 'result_version', 'result_version INT NOT NULL DEFAULT 0 AFTER bet_wala_odds');
CALL bridge_add_column('matches', 'result_source', "result_source ENUM('manual','betting') NULL AFTER result_version");
CALL bridge_add_column('matches', 'result_corrected_at', 'result_corrected_at DATETIME NULL AFTER result_source');
CALL bridge_add_column('matches', 'result_corrected_from', 'result_corrected_from VARCHAR(60) NULL AFTER result_corrected_at');
CALL bridge_add_column('matches', 'duration_seconds', 'duration_seconds INT NULL AFTER result_corrected_from');

DROP PROCEDURE IF EXISTS bridge_add_column;

-- Messages to the betting station, kept until it confirms them.
CREATE TABLE IF NOT EXISTS bridge_outbox (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  msg_key VARCHAR(100) NOT NULL,
  type VARCHAR(30) NOT NULL,
  match_id INT NULL,
  payload LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  attempts INT NOT NULL DEFAULT 0,
  http_status INT NULL,
  last_error TEXT NULL,
  UNIQUE KEY bridge_outbox_key_unique (msg_key),
  KEY bridge_outbox_pending_idx (sent_at, id)
);

-- Messages from the betting station (same key = same answer, so retries are harmless).
CREATE TABLE IF NOT EXISTS bridge_inbox (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  msg_key VARCHAR(100) NOT NULL,
  type VARCHAR(30) NOT NULL,
  payload LONGTEXT NOT NULL,
  http_status INT NOT NULL,
  response TEXT NOT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY bridge_inbox_key_unique (msg_key)
);
