export const HERITAGE_QUERIES = {
  FIND_BY_NAME: `
    SELECT
      name,
      country,
      civilization,
      religion,
      architecture_style AS "architectureStyle",
      material,
      year_midpoint AS "yearMidpoint",
      description,
      COALESCE(similarity(LOWER(name), LOWER($1)), 0) AS score
    FROM heritage_sites
    WHERE LOWER(name) ILIKE '%' || LOWER($1) || '%'
       OR similarity(LOWER(name), LOWER($1)) > 0.3
    ORDER BY score DESC
    LIMIT 1;
  `,

  FIND_ALL: `
    SELECT * FROM heritage_sites;
  `
};
