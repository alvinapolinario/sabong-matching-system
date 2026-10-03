-- Re-fight of a cancelled fight (e.g. a cock was injured and rested): a NEW fight with the
-- same cocks and sides, linked to the cancelled one. Run once on existing databases:
--   docker exec -i sabong-mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" matching_db' < sql/008_rematch.sql
-- Safe to run again.
USE matching_db;

DROP PROCEDURE IF EXISTS rematch_add_column;
DELIMITER $$
CREATE PROCEDURE rematch_add_column(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col) THEN
    SET @ddl = CONCAT('ALTER TABLE ', tbl, ' ADD COLUMN ', ddl);
    PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL rematch_add_column('matches', 'rematch_of', 'rematch_of INT NULL AFTER duration_seconds');
CALL rematch_add_column('matches', 'rematch_reason', 'rematch_reason VARCHAR(255) NULL AFTER rematch_of');

DROP PROCEDURE IF EXISTS rematch_add_column;
