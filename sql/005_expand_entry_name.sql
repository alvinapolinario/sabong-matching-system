USE matching_db;

ALTER TABLE entries
  MODIFY entry_name VARCHAR(255) NOT NULL;
