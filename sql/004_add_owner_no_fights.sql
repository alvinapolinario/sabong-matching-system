USE matching_db;

CREATE TABLE IF NOT EXISTS owner_no_fights (
  no_fight_id INT AUTO_INCREMENT PRIMARY KEY,
  owner_a_id INT NOT NULL,
  owner_b_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT owner_no_fights_owner_a_fk FOREIGN KEY (owner_a_id) REFERENCES owners(owner_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT owner_no_fights_owner_b_fk FOREIGN KEY (owner_b_id) REFERENCES owners(owner_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE KEY owner_no_fights_pair_unique (owner_a_id, owner_b_id),
  KEY owner_no_fights_owner_b_idx (owner_b_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
