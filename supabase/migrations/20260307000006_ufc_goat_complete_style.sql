-- Mark universally recognized UFC GOATs as 'complete' fighter style.
-- These are fighters regarded as elite across striking, grappling, and fight IQ —
-- not just specialists. Applied conservatively; most fighters remain ko_artist/grappler/balanced.
--
-- Not marked 'complete':
--   Khabib, Islam Makhachev — dominant but style identity is grappling/sambo
--   Alex Pereira — elite striker/KO artist but not a complete fighter
--   Conor McGregor — elite striker, but exploitable defensively on the ground

UPDATE ufc_fighter_ratings
SET style = 'complete', updated_at = NOW()
WHERE fighter_name IN (
  'jon jones',
  'georges st-pierre',
  'amanda nunes',
  'demetrious johnson',
  'anderson silva',
  'valentina shevchenko',
  'zhang weili',
  'ilia topuria'
);
