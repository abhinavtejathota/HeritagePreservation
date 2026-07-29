import { pool } from "../db/postgres";
import { HERITAGE_QUERIES } from "../db/queries";
import { HeritageSite } from "../models/HeritageSite.model";

export class HeritageRepository {
  async findByName(query: string): Promise<HeritageSite | null> {
    const result = await pool.query(
      HERITAGE_QUERIES.FIND_BY_NAME,
      [query]
    );

    return result.rows[0] || null;
  }

  async findAll(): Promise<HeritageSite[]> {
    const result = await pool.query(HERITAGE_QUERIES.FIND_ALL);
    return result.rows;
  }
}

