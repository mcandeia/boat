-- Backfill jewel images (static catalog seed) and ensure jewelry listings
-- don't carry item_attrs (refinement/options/etc).

-- Catalog thumbnails for common jewels (public stable URLs).
UPDATE items SET image_url = 'https://wiki.infinitymu.net/images/c/c8/Bless.jpg'
 WHERE slug = 'jewel-of-bless';

UPDATE items SET image_url = 'https://wiki.infinitymu.net/images/e/ed/StatFruitChaos.png'
 WHERE slug = 'jewel-of-chaos';

UPDATE items SET image_url = 'https://wiki.infinitymu.net/images/9/9d/StatFruitCreation.png'
 WHERE slug = 'jewel-of-creation';

UPDATE items SET image_url = 'https://wiki.infinitymu.net/images/f/fe/Jogb.jpg'
 WHERE slug = 'jewel-of-guardian';

-- Enforce "jewelry has no attrs" for existing listings already stored.
UPDATE listings
   SET item_attrs = NULL
 WHERE kind = 'item'
   AND item_slug IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM items i
      WHERE i.slug = listings.item_slug
        AND (
          lower(i.category) = 'jewels'
          OR lower(i.category) LIKE 'rings-pendants%'
        )
   );

