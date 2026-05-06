import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1778083876987 implements MigrationInterface {
  name = 'Migration1778083876987';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX "IDX_7bb07d3c6e225d75d8418380f1" ON "order" ("createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_4a9f01c8d132a255d61263d52e" ON "order" ("userId", "createdAt")`);
    // Partial index on active statuses only — full-table status index has too low selectivity to be useful
    await queryRunner.query(
      `CREATE INDEX "IDX_order_active_status" ON "order" ("status") WHERE "status" IN ('pending', 'processing')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_order_active_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4a9f01c8d132a255d61263d52e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7bb07d3c6e225d75d8418380f1"`);
  }
}
