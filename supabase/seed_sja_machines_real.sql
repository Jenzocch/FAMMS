-- ============================================================
-- FAMMS — SJA (Sinar Jaya Abadi) real machine inventory
--
-- Source: SJA-FR-PRD-001-DAP (Daftar Alat dan Mesin Produksi), Rev 02,
-- 13 Desember 2025 — 109 machines, every one with a code and a location.
--
-- Until now FAMMS held only four placeholder SJA machines (SJA-CMP-001 etc.)
-- with generic English names. These are the real ones.
--
-- Areas: the DAP's "Lokasi" column is finer than the seven SJA rooms the QC
-- side walks — it distinguishes "Mixing mutiara" from "Mutiara", "Filling
-- powder" from "Powder", and so on. Machines are filed into the seven rooms
-- created by migration_areas_match_fqms.sql, and the DAP's own location string
-- is kept verbatim in remarks so nothing is lost. If maintenance later wants
-- the finer locations as real areas, the remarks carry everything needed.
--
-- Status is derived from the DAP's own notes, not assumed:
--   "sedang diperbaiki"                                   -> repairing
--   "tidak/belum/jarang dipakai", "cadangan"              -> standby
--   everything else                                       -> running
-- Nothing is marked 'scrapped': "not used" is not "off the floor", and
-- scrapped machines drop out of the QC inspection list entirely.
--
-- ⚠️ Three things to confirm on site:
--   1. PD10 — every other cooling tank is TPD1..TPD9, so this reads like a
--      typo for TPD10 in the source. Transcribed verbatim rather than
--      "corrected": a machine code is not something to guess at. Fix it in
--      FAMMS Settings if it is indeed a typo.
--   2. P1 (Blender, Powder) is the only single-letter code in the sheet.
--      Also transcribed verbatim.
--   3. "Timbang warna" and "Sisa sirup" are stations rather than rooms. Their
--      scales are filed under SJA-SNJ; move them if that is wrong.
--
-- Prerequisite: migration_areas_match_fqms.sql (creates the seven SJA areas).
-- Idempotent: NOT EXISTS guard on (factory_id, machine_code).
-- Rollback: see end of file.
-- ============================================================

INSERT INTO machines (factory_id, area_id, machine_code, machine_name, status, remarks)
SELECT f.id, ar.id, m.machine_code, m.machine_name, m.status, m.remarks
FROM factories f
CROSS JOIN (VALUES
  ('AYT1', 'Mesin Ayak Tepung AYT1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('LFT1', 'Lift Tepung LFT1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('MIX1', 'Mesin Mixer MIX1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mixing mutiara'),
  ('MIX2', 'Mesin Mixer MIX2', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mixing mutiara'),
  ('MIX4', 'Mesin Mixer MIX4', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mixing mutiara — Untuk boba warna'),
  ('GRI1', 'Mesin Grinder GRI1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mixing mutiara'),
  ('GRI2', 'Mesin Grinder GRI2', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mixing mutiara'),
  ('GRI3', 'Mesin Grinder GRI3', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mixing mutiara — Dipakai di molen'),
  ('GRI4', 'Mesin Grinder GRI4', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mixing mutiara — Boba warna'),
  ('GRI5', 'Mesin Grinder GRI5', 'SJA-POWDER', 'running', 'Lokasi DAP: Powder'),
  ('MOL1', 'Mesin Molen MOL1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('MOL2', 'Mesin Molen MOL2', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('MOL3', 'Mesin Molen MOL3', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('MOL4', 'Mesin Molen MOL4', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('MOL5', 'Mesin Molen MOL5', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('MOL6', 'Mesin Molen MOL6', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('MOL7', 'Mesin Molen MOL7', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('MOL8', 'Mesin Molen MOL8', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('MOL9', 'Mesin Molen MOL9', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('MOL10', 'Mesin Molen MOL10', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('MOL11', 'Mesin Molen MOL11', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara — Boba warna'),
  ('COV1', 'Conveyor Vertikal COV1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('COV2', 'Conveyor Vertikal COV2', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('COH1', 'Conveyor Horizontal COH1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('COH2', 'Conveyor Horizontal COH2', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('AYM1', 'Mesin Ayak Mutiara AYM1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('AYM2', 'Mesin Ayak Mutiara AYM2', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('AYM3', 'Mesin Ayak Mutiara AYM3', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara — Boba warna'),
  ('AYM4', 'Mesin Ayak Mutiara AYM4', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara — Bibit'),
  ('BPM1', 'Bak penampung mutiara BPM1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('BPM2', 'Bak penampung mutiara BPM2', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('TMO1', 'Timbangan Otomatis TMO1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('TMO2', 'Timbangan Otomatis TMO2', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('MTD1', 'Metal Detector MTD1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('VAC1', 'Mesin Vacuum VAC1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('VAC2', 'Mesin Vacuum VAC2', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('VAC3', 'Mesin Vacuum VAC3', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('VAC4', 'Mesin Vacuum VAC4', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('VAC5', 'Mesin Vacuum VAC5', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('VAC6', 'Mesin Vacuum VAC6', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('VAC7', 'Mesin Vacuum VAC7', 'SJA-MUTIARA', 'standby', 'Lokasi DAP: Mutiara — Jarang dipakai, untuk cadangan (ada di produksi)'),
  ('VAC8', 'Mesin Vacuum VAC8', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('VAC9', 'Mesin Vacuum VAC9', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('HSL1', 'Mesin Horizontal Sealer HSL1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('PGM1', 'Paging Machine PGM1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('VJT1', 'Mesin Videojet VJT1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('VJT2', 'Mesin Videojet VJT2', 'SJA-MUTIARA', 'standby', 'Lokasi DAP: Mutiara — Untuk cadangan'),
  ('CSR1', 'Carton Sealer CSR1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara — Untuk muat'),
  ('CSR3', 'Carton Sealer CSR3', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara — Untuk muat'),
  ('CSR4', 'Carton Sealer CSR4', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('MKJ1', 'Mesin MKjet MKJ1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('P1', 'Blender P1', 'SJA-POWDER', 'standby', 'Lokasi DAP: Powder — Jarang dipakai'),
  ('MIP1', 'Mesin Mixing Powder MIP1', 'SJA-FORMBAW', 'running', 'Lokasi DAP: Formulasi Bawah'),
  ('MIP2', 'Mesin Mixing Powder MIP2', 'SJA-POWDER', 'running', 'Lokasi DAP: Powder'),
  ('VSL1', 'Vertical sealer VSL1', 'SJA-SNJ', 'running', 'Lokasi DAP: Nata'),
  ('VSL2', 'Vertical sealer VSL2', 'SJA-SNJ', 'standby', 'Lokasi DAP: Nata — Untuk cadangan'),
  ('VSL4', 'Vertical sealer VSL4', 'SJA-POWDER', 'running', 'Lokasi DAP: Powder'),
  ('FOR1', 'Forklift FOR1', 'SJA-GDATAS', 'running', 'Lokasi DAP: Gudang Atas'),
  ('HPE1', 'Hand Pallet Electric HPE1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('HPE2', 'Hand Pallet Electric HPE2', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('VCC1', 'Vacuum Cleaner VCC1', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('VCC2', 'Vacuum Cleaner VCC2', 'SJA-GDATAS', 'running', 'Lokasi DAP: Gudang Atas'),
  ('TDK1', 'Timbangan Digital Kecil TDK1', 'SJA-SNJ', 'running', 'Lokasi DAP: Prod. Sirup'),
  ('TDK2', 'Timbangan Digital Kecil TDK2', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('TDK3', 'Timbangan Digital Kecil TDK3', 'SJA-SNJ', 'running', 'Lokasi DAP: Timbang warna'),
  ('TDK4', 'Timbangan Digital Kecil TDK4', 'SJA-POWDER', 'running', 'Lokasi DAP: Filling powder'),
  ('TDK5', 'Timbangan Digital Kecil TDK5', 'SJA-SNJ', 'running', 'Lokasi DAP: Prod. Sirup'),
  ('TDK6', 'Timbangan Digital Kecil TDK6', 'SJA-POWDER', 'running', 'Lokasi DAP: Formulasi powder'),
  ('TDK7', 'Timbangan Digital Kecil TDK7', 'SJA-MUTIARA', 'running', 'Lokasi DAP: Mutiara'),
  ('TDK8', 'Timbangan Digital Kecil TDK8', 'SJA-FORMBAW', 'running', 'Lokasi DAP: Formulasi bawah'),
  ('TDK9', 'Timbangan Digital Kecil TDK9', 'SJA-POWDER', 'running', 'Lokasi DAP: Formulasi powder'),
  ('TDB1', 'Timbangan Digital Besar TDB1', 'SJA-FORMBAW', 'running', 'Lokasi DAP: Formulasi bawah'),
  ('TDB2', 'Timbangan Digital Besar TDB2', 'SJA-POWDER', 'running', 'Lokasi DAP: Prod. Powder'),
  ('TDB3', 'Timbangan Digital Besar TDB3', 'SJA-SNJ', 'running', 'Lokasi DAP: Prod. Sirup'),
  ('TDB4', 'Timbangan Digital Besar TDB4', 'SJA-POWDER', 'running', 'Lokasi DAP: Kemas powder'),
  ('TDB5', 'Timbangan Digital Besar TDB5', 'SJA-SNJ', 'running', 'Lokasi DAP: Sisa sirup'),
  ('HMG1', 'Mesin Homogenizer HMG1', 'SJA-SNJ', 'standby', 'Lokasi DAP: Nata — Tidak dipakai'),
  ('HMG2', 'Mesin Homogenizer HMG2', 'SJA-SNJ', 'running', 'Lokasi DAP: Syrup dan Jelly'),
  ('BMC1', 'Mixer duduk BMC1', 'SJA-POWDER', 'running', 'Lokasi DAP: Powder'),
  ('BMC2', 'Mixer duduk BMC2', 'SJA-POWDER', 'running', 'Lokasi DAP: Powder'),
  ('TMS1', 'Tangki Masak TMS1', 'SJA-SNJ', 'running', 'Lokasi DAP: Syrup dan Jelly'),
  ('TMS2', 'Tangki Masak TMS2', 'SJA-SNJ', 'running', 'Lokasi DAP: Syrup dan Jelly'),
  ('TMS3', 'Tangki Masak TMS3', 'SJA-SNJ', 'running', 'Lokasi DAP: Nata'),
  ('TMS4', 'Tangki Masak TMS4', 'SJA-SNJ', 'running', 'Lokasi DAP: Nata'),
  ('TMS5', 'Tangki Masak TMS5', 'SJA-SNJ', 'standby', 'Lokasi DAP: Nata — Tidak dipakai'),
  ('TMS6', 'Tangki Masak TMS6', 'SJA-SNJ', 'running', 'Lokasi DAP: Nata'),
  ('TMS7', 'Tangki Masak TMS7', 'SJA-SNJ', 'running', 'Lokasi DAP: Nata'),
  ('TMS8', 'Tangki Masak TMS8', 'SJA-SNJ', 'standby', 'Lokasi DAP: Nata (belum dipakai)'),
  ('TMS9', 'Tangki Masak TMS9', 'SJA-SNJ', 'standby', 'Lokasi DAP: Nata (belum dipakai) — Ukuran paling besar'),
  ('TPD1', 'Tangki Pendingin TPD1', 'SJA-SNJ', 'running', 'Lokasi DAP: Syrup dan Jelly'),
  ('TPD2', 'Tangki Pendingin TPD2', 'SJA-SNJ', 'running', 'Lokasi DAP: Syrup dan Jelly'),
  ('TPD3', 'Tangki Pendingin TPD3', 'SJA-SNJ', 'running', 'Lokasi DAP: Syrup dan Jelly'),
  ('TPD4', 'Tangki Pendingin TPD4', 'SJA-SNJ', 'running', 'Lokasi DAP: Syrup dan Jelly'),
  ('TPD5', 'Tangki Pendingin TPD5', 'SJA-SNJ', 'running', 'Lokasi DAP: Syrup dan Jelly'),
  ('TPD6', 'Tangki Pendingin TPD6', 'SJA-SNJ', 'running', 'Lokasi DAP: Syrup dan Jelly'),
  ('TPD7', 'Tangki Pendingin TPD7', 'SJA-SNJ', 'running', 'Lokasi DAP: Nata — Label sudah pudar'),
  ('TPD8', 'Tangki Pendingin TPD8', 'SJA-SNJ', 'running', 'Lokasi DAP: Nata — Label sudah pudar'),
  ('TPD9', 'Tangki Pendingin TPD9', 'SJA-SNJ', 'standby', 'Lokasi DAP: Nata (belum dipakai)'),
  ('PD10', 'Tangki Pendingin PD10', 'SJA-SNJ', 'standby', 'Lokasi DAP: Nata (belum dipakai)'),
  ('PTJ1', 'Mesin Potong Jelly PTJ1', 'SJA-SNJ', 'running', 'Lokasi DAP: Syrup dan Jelly'),
  ('PTJ2', 'Mesin Potong Jelly PTJ2', 'SJA-SNJ', 'running', 'Lokasi DAP: Syrup dan Jelly'),
  ('CST1', 'Mesin Sealer Toples CST1', 'SJA-GDBAWAH', 'repairing', 'Lokasi DAP: Gudang Bawah — Sedang diperbaiki'),
  ('CST2', 'Mesin Sealer Toples CST2', 'SJA-SNJ', 'running', 'Lokasi DAP: Jelly'),
  ('CST3', 'Mesin Sealer Toples CST3', 'SJA-GDBAWAH', 'running', 'Lokasi DAP: Gudang Bawah'),
  ('KOM1', 'Kompresor KOM1', 'SJA-GDBAWAH', 'running', 'Lokasi DAP: Gudang Bawah'),
  ('KOM2', 'Kompresor KOM2', 'SJA-GDBAWAH', 'running', 'Lokasi DAP: Gudang Bawah'),
  ('HMX1', 'Hand Mixer Portable HMX1', 'SJA-SNJ', 'running', 'Lokasi DAP: Syrup dan Jelly'),
  ('FRZ1', 'Freezer FRZ1', 'SJA-GDBAWAH', 'running', 'Lokasi DAP: Gudang Bawah'),
  ('CHI1', 'Chiller CHI1', 'SJA-GDBAWAH', 'running', 'Lokasi DAP: Gudang Bawah')
) AS m(machine_code, machine_name, area_code, status, remarks)
JOIN areas ar ON ar.factory_id = f.id AND ar.code = m.area_code
WHERE f.code = 'SJA'
  AND NOT EXISTS (
    SELECT 1 FROM machines x WHERE x.factory_id = f.id AND x.machine_code = m.machine_code
  );

NOTIFY pgrst, 'reload schema';

-- Verify:
--   SELECT a.code, count(*) FROM machines m
--   JOIN areas a ON a.id = m.area_id JOIN factories f ON f.id = m.factory_id
--   WHERE f.code = 'SJA' GROUP BY a.code ORDER BY a.code;
--   -- expect {'SJA-FORMBAW': 3, 'SJA-GDATAS': 2, 'SJA-GDBAWAH': 6, 'SJA-MUTIARA': 55, 'SJA-POWDER': 11, 'SJA-SNJ': 32} (plus PROD 4, the pre-existing demo machines)
--
--   SELECT status, count(*) FROM machines m JOIN factories f ON f.id = m.factory_id
--   WHERE f.code = 'SJA' AND m.remarks LIKE 'Lokasi DAP:%' GROUP BY status;
--   -- expect {'repairing': 1, 'running': 98, 'standby': 10}
--
-- Rollback:
--   DELETE FROM machines
--   WHERE factory_id = (SELECT id FROM factories WHERE code = 'SJA')
--     AND remarks LIKE 'Lokasi DAP:%';
