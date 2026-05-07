import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1778140905893 implements MigrationInterface {
  name = 'Migration1778140905893';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_7a9573d6a1fb982772a9123320"`);
    await queryRunner.query(
      `CREATE TYPE "public"."order_status_history_from_status_enum" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_status_history_to_status_enum" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_status_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "from_status" "public"."order_status_history_from_status_enum", "to_status" "public"."order_status_history_to_status_enum" NOT NULL, "changed_by" character varying NOT NULL, "changed_at" TIMESTAMP NOT NULL DEFAULT now(), "notes" text, CONSTRAINT "PK_e6c66d853f155531985fc4f6ec8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_b314835875d715a66d3b28598a" ON "order_status_history"  ("changed_at") `);
    await queryRunner.query(`CREATE INDEX "IDX_1ca7d5228cf9dc589b60243933" ON "order_status_history"  ("order_id") `);
    await queryRunner.query(
      `ALTER TABLE "order_status_history" ADD CONSTRAINT "FK_1ca7d5228cf9dc589b60243933c" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_status_history" DROP CONSTRAINT "FK_1ca7d5228cf9dc589b60243933c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1ca7d5228cf9dc589b60243933"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b314835875d715a66d3b28598a"`);
    await queryRunner.query(`DROP TABLE "order_status_history"`);
    await queryRunner.query(`DROP TYPE "public"."order_status_history_to_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."order_status_history_from_status_enum"`);
    await queryRunner.query(`CREATE INDEX "IDX_7a9573d6a1fb982772a9123320" ON "order" USING btree ("status") `);
  }
}
