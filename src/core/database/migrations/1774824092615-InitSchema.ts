import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1774824092615 implements MigrationInterface {
    name = 'InitSchema1774824092615'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`tasks\` (\`id\` int NOT NULL AUTO_INCREMENT, \`ownerUserId\` varchar(120) NOT NULL, \`title\` varchar(120) NOT NULL, \`description\` text NULL, \`createdAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`scheduled_message_tasks\` (\`id\` int NOT NULL AUTO_INCREMENT, \`ownerUserId\` varchar(120) NOT NULL, \`jobName\` varchar(120) NOT NULL, \`isForwarded\` tinyint NOT NULL DEFAULT 1, \`message\` text NOT NULL, \`frequencyInMinutes\` int UNSIGNED NOT NULL, \`recipients\` text NOT NULL, \`sendWindowStart\` char(5) NULL, \`sendWindowEnd\` char(5) NULL, \`sendWindowStartAt\` char(5) NULL, \`isActive\` tinyint NOT NULL DEFAULT 1, \`isWindowEnabled\` tinyint NOT NULL DEFAULT 1, \`deactivatedAt\` datetime NULL, \`lastRunAt\` datetime NULL, \`runsCount\` int UNSIGNED NOT NULL DEFAULT '0', \`lastError\` text NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_805ee47b1df183036adac8bf87\` (\`jobName\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`message_dispatch_logs\` (\`id\` int NOT NULL AUTO_INCREMENT, \`ownerUserId\` varchar(120) NOT NULL, \`scheduledTaskId\` int NULL, \`recipientName\` varchar(120) NULL, \`recipientPhone\` varchar(40) NOT NULL, \`isForwarded\` tinyint NOT NULL DEFAULT 1, \`message\` text NOT NULL, \`frequencyInMinutes\` int UNSIGNED NOT NULL DEFAULT '0', \`status\` varchar(20) NOT NULL, \`statusCode\` int NULL, \`responseBody\` text NULL, \`error\` text NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`device_registrations\` (\`id\` int NOT NULL AUTO_INCREMENT, \`ownerUserId\` varchar(120) NOT NULL, \`externalDeviceId\` varchar(120) NOT NULL, \`displayName\` varchar(150) NULL, \`jid\` varchar(150) NULL, \`sessionJid\` varchar(150) NULL, \`providerState\` varchar(50) NULL, \`providerCreatedAt\` datetime NULL, \`isActive\` tinyint NOT NULL DEFAULT 1, \`isLoggedIn\` tinyint NOT NULL DEFAULT 0, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`message_dispatch_logs\` ADD CONSTRAINT \`FK_9bcf18468172ced993d26109bcc\` FOREIGN KEY (\`scheduledTaskId\`) REFERENCES \`scheduled_message_tasks\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`message_dispatch_logs\` DROP FOREIGN KEY \`FK_9bcf18468172ced993d26109bcc\``);
        await queryRunner.query(`DROP TABLE \`device_registrations\``);
        await queryRunner.query(`DROP TABLE \`message_dispatch_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_805ee47b1df183036adac8bf87\` ON \`scheduled_message_tasks\``);
        await queryRunner.query(`DROP TABLE \`scheduled_message_tasks\``);
        await queryRunner.query(`DROP TABLE \`tasks\``);
    }

}
