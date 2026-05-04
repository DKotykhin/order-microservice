import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1777918160807 implements MigrationInterface {
    name = 'Migration1777918160807'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."order_item_currency_enum" AS ENUM('USD', 'EUR', 'GBP', 'UAH')`);
        await queryRunner.query(`CREATE TYPE "public"."order_item_pricetype_enum" AS ENUM('regular', 'discount', 'wholesale')`);
        await queryRunner.query(`CREATE TABLE "order_item" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "productId" character varying NOT NULL, "variantId" character varying, "title" character varying NOT NULL, "variantName" character varying, "imageUrl" character varying, "quantity" integer NOT NULL, "unitPrice" numeric(10,2) NOT NULL, "currency" "public"."order_item_currency_enum" NOT NULL DEFAULT 'UAH', "priceType" "public"."order_item_pricetype_enum" NOT NULL DEFAULT 'regular', "orderId" uuid, CONSTRAINT "PK_d01158fe15b1ead5c26fd7f4e90" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."order_status_enum" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')`);
        await queryRunner.query(`CREATE TYPE "public"."order_currency_enum" AS ENUM('USD', 'EUR', 'GBP', 'UAH')`);
        await queryRunner.query(`CREATE TABLE "order" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" character varying NOT NULL, "status" "public"."order_status_enum" NOT NULL DEFAULT 'pending', "currency" "public"."order_currency_enum" NOT NULL DEFAULT 'UAH', "totalPrice" numeric(10,2) NOT NULL, "notes" text, CONSTRAINT "PK_1031171c13130102495201e3e20" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "order_item" ADD CONSTRAINT "FK_646bf9ece6f45dbe41c203e06e0" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_item" DROP CONSTRAINT "FK_646bf9ece6f45dbe41c203e06e0"`);
        await queryRunner.query(`DROP TABLE "order"`);
        await queryRunner.query(`DROP TYPE "public"."order_currency_enum"`);
        await queryRunner.query(`DROP TYPE "public"."order_status_enum"`);
        await queryRunner.query(`DROP TABLE "order_item"`);
        await queryRunner.query(`DROP TYPE "public"."order_item_pricetype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."order_item_currency_enum"`);
    }

}
