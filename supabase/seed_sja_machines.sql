-- ============================================================================
-- SJA — areas and machines, from SJA-FR-PRD-001-DAP Rev.02 (13 Desember 2025)
-- (run in Supabase SQL editor; idempotent)
-- ============================================================================
--
-- 15 areas, 109 machines, transcribed from the factory's own official
-- "Daftar Alat dan Mesin Produksi" form. Machine codes are EXACTLY as printed
-- on that form (AYT1, MIX1, …) and not prefixed with the factory: the unique
-- index is (factory_id, machine_code) (schema.sql:588), so SJA's MIX1 and
-- DIN's MIX1 can coexist, and this is the code an operator reads off the
-- machine and FQMS sends back.
--
-- Four corrections were applied to the form's data, all confirmed with the
-- owner before importing:
--
--   1. "Formulasi Bawah" / "Formulasi bawah" — capitalisation only, same
--      room. Merged, or FAMMS would show two areas.
--   2. "Nata (belum dipakai)" is not a room; it means those four tanks are
--      not commissioned yet. Area is Nata; the machines get status 'standby'
--      and a remark.
--   3. "Jelly" (one machine, CST2) merged into "Syrup dan Jelly" — same room.
--   4. PD10 → TPD10. Every other Tangki Pendingin is TPD1..TPD9; this one
--      lost its leading T. The original is kept in remarks.
--
-- Gaps left as-is because they are the form's own: MIX3, CSR2 and VSL3 do not
-- appear. Only what the form lists is imported.
--
-- Area codes are generated from the Lokasi names (Mixing mutiara →
-- MIXING-MUTIARA). The form has no area codes and FAMMS requires one. FQMS
-- adopts these from GET /api/external/inspection-targets — see
-- docs/FQMS_INTEGRATION.md.
--
-- Machine status is only set on FIRST insert. Re-running this file updates
-- names, areas and remarks but never touches status: by then a technician may
-- have moved a machine to 'repairing', and a re-import must not undo that.

BEGIN;

-- ── Areas ───────────────────────────────────────────────────────────────────
INSERT INTO areas (factory_id, code, name)
SELECT f.id, v.code, v.name
FROM (VALUES
  ('FILLING-POWDER', 'Filling powder'),
  ('FORMULASI-BAWAH', 'Formulasi bawah'),
  ('FORMULASI-POWDER', 'Formulasi powder'),
  ('GUDANG-ATAS', 'Gudang Atas'),
  ('GUDANG-BAWAH', 'Gudang Bawah'),
  ('KEMAS-POWDER', 'Kemas powder'),
  ('MIXING-MUTIARA', 'Mixing mutiara'),
  ('MUTIARA', 'Mutiara'),
  ('NATA', 'Nata'),
  ('POWDER', 'Powder'),
  ('PROD-POWDER', 'Prod. Powder'),
  ('PROD-SIRUP', 'Prod. Sirup'),
  ('SISA-SIRUP', 'Sisa sirup'),
  ('SYRUP-DAN-JELLY', 'Syrup dan Jelly'),
  ('TIMBANG-WARNA', 'Timbang warna')
) AS v(code, name)
CROSS JOIN factories f
WHERE f.code = 'SJA'
ON CONFLICT (factory_id, code) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

-- ── Machines ────────────────────────────────────────────────────────────────
INSERT INTO machines (factory_id, area_id, machine_code, machine_name, brand, model, status, remarks)
SELECT a.factory_id, a.id, v.code, v.name, v.brand, v.model, v.status, v.remarks
FROM (VALUES
  ('FILLING-POWDER', 'TDK4', 'Timbangan Digital Kecil', 'Digi', 'DS-673', 'running', 'Resolusi 0.001 kg; Kapasitas 3 kg'),
  ('FORMULASI-BAWAH', 'MIP1', 'Mesin Mixing Powder', NULL, NULL, 'running', NULL),
  ('FORMULASI-BAWAH', 'TDB1', 'Timbangan Digital Besar', NULL, NULL, 'running', NULL),
  ('FORMULASI-BAWAH', 'TDK8', 'Timbangan Digital Kecil', 'Digi', 'DS-673', 'running', 'Resolusi 0.001 kg; Kapasitas 3 kg'),
  ('FORMULASI-POWDER', 'TDK6', 'Timbangan Digital Kecil', 'Kenko', 'KK-SW', 'running', 'Resolusi 0.1 g; Kapasitas 15 kg'),
  ('FORMULASI-POWDER', 'TDK9', 'Timbangan Digital Kecil', 'AND', 'EJ-200', 'running', 'Resolusi 0.001 g; Kapasitas 210 g'),
  ('GUDANG-ATAS', 'FOR1', 'Forklift', NULL, NULL, 'running', NULL),
  ('GUDANG-ATAS', 'VCC2', 'Vacuum Cleaner', NULL, NULL, 'running', NULL),
  ('GUDANG-BAWAH', 'CHI1', 'Chiller', NULL, NULL, 'running', NULL),
  ('GUDANG-BAWAH', 'CST1', 'Mesin Sealer Toples', NULL, NULL, 'repairing', 'Sedang diperbaiki'),
  ('GUDANG-BAWAH', 'CST3', 'Mesin Sealer Toples', NULL, NULL, 'running', NULL),
  ('GUDANG-BAWAH', 'FRZ1', 'Freezer', NULL, NULL, 'running', NULL),
  ('GUDANG-BAWAH', 'KOM1', 'Kompresor', NULL, NULL, 'running', NULL),
  ('GUDANG-BAWAH', 'KOM2', 'Kompresor', NULL, NULL, 'running', NULL),
  ('KEMAS-POWDER', 'TDB4', 'Timbangan Digital Besar', 'Cân Điện Tử Sài Gòn', 'SGH-100', 'running', 'Resolusi 0.01 kg; Kapasitas 100 kg'),
  ('MIXING-MUTIARA', 'GRI1', 'Mesin Grinder', NULL, NULL, 'running', NULL),
  ('MIXING-MUTIARA', 'GRI2', 'Mesin Grinder', NULL, NULL, 'running', NULL),
  ('MIXING-MUTIARA', 'GRI3', 'Mesin Grinder', NULL, NULL, 'running', 'Dipakai di molen'),
  ('MIXING-MUTIARA', 'GRI4', 'Mesin Grinder', NULL, NULL, 'running', 'Boba warna'),
  ('MIXING-MUTIARA', 'MIX1', 'Mesin Mixer', NULL, NULL, 'running', NULL),
  ('MIXING-MUTIARA', 'MIX2', 'Mesin Mixer', NULL, NULL, 'running', NULL),
  ('MIXING-MUTIARA', 'MIX4', 'Mesin Mixer', NULL, NULL, 'running', 'Untuk boba warna'),
  ('MUTIARA', 'AYM1', 'Mesin Ayak Mutiara', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'AYM2', 'Mesin Ayak Mutiara', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'AYM3', 'Mesin Ayak Mutiara', NULL, NULL, 'running', 'Boba warna'),
  ('MUTIARA', 'AYM4', 'Mesin Ayak Mutiara', NULL, NULL, 'running', 'Bibit'),
  ('MUTIARA', 'AYT1', 'Mesin Ayak Tepung', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'BPM1', 'Bak penampung mutiara', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'BPM2', 'Bak penampung mutiara', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'COH1', 'Conveyor Horizontal', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'COH2', 'Conveyor Horizontal', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'COV1', 'Conveyor Vertikal', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'COV2', 'Conveyor Vertikal', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'CSR1', 'Carton Sealer', NULL, NULL, 'running', 'Untuk muat'),
  ('MUTIARA', 'CSR3', 'Carton Sealer', NULL, NULL, 'running', 'Untuk muat'),
  ('MUTIARA', 'CSR4', 'Carton Sealer', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'HPE1', 'Hand Pallet Electric', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'HPE2', 'Hand Pallet Electric', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'HSL1', 'Mesin Horizontal Sealer', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'LFT1', 'Lift Tepung', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'MKJ1', 'Mesin MKjet', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'MOL1', 'Mesin Molen', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'MOL10', 'Mesin Molen', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'MOL11', 'Mesin Molen', NULL, NULL, 'running', 'Boba warna'),
  ('MUTIARA', 'MOL2', 'Mesin Molen', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'MOL3', 'Mesin Molen', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'MOL4', 'Mesin Molen', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'MOL5', 'Mesin Molen', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'MOL6', 'Mesin Molen', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'MOL7', 'Mesin Molen', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'MOL8', 'Mesin Molen', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'MOL9', 'Mesin Molen', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'MTD1', 'Metal Detector', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'PGM1', 'Paging Machine', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'TDK2', 'Timbangan Digital Kecil', 'Digi', 'DS-673SS', 'running', 'Resolusi 0.001 g; Kapasitas 3 kg'),
  ('MUTIARA', 'TDK7', 'Timbangan Digital Kecil', 'Sonic', 'Super-SS', 'running', 'Resolusi 0.001 kg; Kapasitas 15 kg'),
  ('MUTIARA', 'TMO1', 'Timbangan Otomatis', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'TMO2', 'Timbangan Otomatis', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'VAC1', 'Mesin Vacuum', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'VAC2', 'Mesin Vacuum', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'VAC3', 'Mesin Vacuum', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'VAC4', 'Mesin Vacuum', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'VAC5', 'Mesin Vacuum', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'VAC6', 'Mesin Vacuum', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'VAC7', 'Mesin Vacuum', NULL, NULL, 'running', 'Jarang dipakai, untuk cadangan (ada di produksi)'),
  ('MUTIARA', 'VAC8', 'Mesin Vacuum', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'VAC9', 'Mesin Vacuum', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'VCC1', 'Vacuum Cleaner', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'VJT1', 'Mesin Videojet', NULL, NULL, 'running', NULL),
  ('MUTIARA', 'VJT2', 'Mesin Videojet', NULL, NULL, 'running', 'Untuk cadangan'),
  ('NATA', 'HMG1', 'Mesin Homogenizer', NULL, NULL, 'standby', 'Tidak dipakai'),
  ('NATA', 'TMS3', 'Tangki Masak', NULL, NULL, 'running', NULL),
  ('NATA', 'TMS4', 'Tangki Masak', NULL, NULL, 'running', NULL),
  ('NATA', 'TMS5', 'Tangki Masak', NULL, NULL, 'standby', 'Tidak dipakai'),
  ('NATA', 'TMS6', 'Tangki Masak', NULL, NULL, 'running', NULL),
  ('NATA', 'TMS7', 'Tangki Masak', NULL, NULL, 'running', NULL),
  ('NATA', 'TMS8', 'Tangki Masak', NULL, NULL, 'standby', 'Belum dipakai (per form)'),
  ('NATA', 'TMS9', 'Tangki Masak', NULL, NULL, 'standby', 'Ukuran paling besar; Belum dipakai (per form)'),
  ('NATA', 'TPD10', 'Tangki Pendingin', NULL, NULL, 'standby', 'Belum dipakai (per form); kode di form: PD10'),
  ('NATA', 'TPD7', 'Tangki Pendingin', NULL, NULL, 'running', 'Label sudah pudar'),
  ('NATA', 'TPD8', 'Tangki Pendingin', NULL, NULL, 'running', 'Label sudah pudar'),
  ('NATA', 'TPD9', 'Tangki Pendingin', NULL, NULL, 'standby', 'Belum dipakai (per form)'),
  ('NATA', 'VSL1', 'Vertical sealer', NULL, NULL, 'running', NULL),
  ('NATA', 'VSL2', 'Vertical sealer', NULL, NULL, 'running', 'Untuk cadangan'),
  ('POWDER', 'BMC1', 'Mixer duduk', NULL, NULL, 'running', NULL),
  ('POWDER', 'BMC2', 'Mixer duduk', NULL, NULL, 'running', NULL),
  ('POWDER', 'GRI5', 'Mesin Grinder', NULL, NULL, 'running', NULL),
  ('POWDER', 'MIP2', 'Mesin Mixing Powder', NULL, NULL, 'running', NULL),
  ('POWDER', 'P1', 'Blender', NULL, NULL, 'running', 'Jarang dipakai'),
  ('POWDER', 'VSL4', 'Vertical sealer', NULL, NULL, 'running', NULL),
  ('PROD-POWDER', 'TDB2', 'Timbangan Digital Besar', NULL, NULL, 'running', NULL),
  ('PROD-SIRUP', 'TDB3', 'Timbangan Digital Besar', 'YHC', 'A12E', 'running', 'Resolusi 0.001 kg'),
  ('PROD-SIRUP', 'TDK1', 'Timbangan Digital Kecil', 'ZOGGI', 'ZG-C702', 'running', 'Resolusi 0.001 g; Kapasitas 500 g'),
  ('PROD-SIRUP', 'TDK5', 'Timbangan Digital Kecil', 'AND', 'HT-120', 'running', 'Resolusi 0.01 g; Kapasitas 120 g'),
  ('SISA-SIRUP', 'TDB5', 'Timbangan Digital Besar', 'CAS', 'BB-C', 'running', 'Resolusi 1 g; Kapasitas 50 kg'),
  ('SYRUP-DAN-JELLY', 'CST2', 'Mesin Sealer Toples', NULL, NULL, 'running', NULL),
  ('SYRUP-DAN-JELLY', 'HMG2', 'Mesin Homogenizer', NULL, NULL, 'running', NULL),
  ('SYRUP-DAN-JELLY', 'HMX1', 'Hand Mixer Portable', NULL, NULL, 'running', NULL),
  ('SYRUP-DAN-JELLY', 'PTJ1', 'Mesin Potong Jelly', NULL, NULL, 'running', NULL),
  ('SYRUP-DAN-JELLY', 'PTJ2', 'Mesin Potong Jelly', NULL, NULL, 'running', NULL),
  ('SYRUP-DAN-JELLY', 'TMS1', 'Tangki Masak', NULL, NULL, 'running', NULL),
  ('SYRUP-DAN-JELLY', 'TMS2', 'Tangki Masak', NULL, NULL, 'running', NULL),
  ('SYRUP-DAN-JELLY', 'TPD1', 'Tangki Pendingin', NULL, NULL, 'running', NULL),
  ('SYRUP-DAN-JELLY', 'TPD2', 'Tangki Pendingin', NULL, NULL, 'running', NULL),
  ('SYRUP-DAN-JELLY', 'TPD3', 'Tangki Pendingin', NULL, NULL, 'running', NULL),
  ('SYRUP-DAN-JELLY', 'TPD4', 'Tangki Pendingin', NULL, NULL, 'running', NULL),
  ('SYRUP-DAN-JELLY', 'TPD5', 'Tangki Pendingin', NULL, NULL, 'running', NULL),
  ('SYRUP-DAN-JELLY', 'TPD6', 'Tangki Pendingin', NULL, NULL, 'running', NULL),
  ('TIMBANG-WARNA', 'TDK3', 'Timbangan Digital Kecil', 'Kenko', 'KK-SW', 'running', 'Resolusi 0.1 g; Kapasitas 15 kg')
) AS v(area_code, code, name, brand, model, status, remarks)
JOIN areas a ON a.code = v.area_code
JOIN factories f ON f.id = a.factory_id AND f.code = 'SJA'
-- Status deliberately absent from the UPDATE list — see the header.
ON CONFLICT (factory_id, machine_code) DO UPDATE
  SET area_id      = EXCLUDED.area_id,
      machine_name = EXCLUDED.machine_name,
      brand        = EXCLUDED.brand,
      model        = EXCLUDED.model,
      remarks      = EXCLUDED.remarks,
      updated_at   = NOW();

COMMIT;

-- ── Verify ──────────────────────────────────────────────────────────────────
SELECT a.code AS area_code, a.name AS area_name,
       COUNT(m.id) AS machines,
       COUNT(*) FILTER (WHERE m.status <> 'running') AS not_running
FROM areas a
JOIN factories f ON f.id = a.factory_id AND f.code = 'SJA'
LEFT JOIN machines m ON m.area_id = a.id
GROUP BY a.code, a.name
ORDER BY a.code;

-- Expect 15 areas / 109 machines / 6 standby + 1 repairing.
SELECT COUNT(DISTINCT a.id) AS areas, COUNT(m.id) AS machines
FROM areas a
JOIN factories f ON f.id = a.factory_id AND f.code = 'SJA'
LEFT JOIN machines m ON m.area_id = a.id;
