CREATE TYPE "public"."verdict" AS ENUM('satisfied', 'not_satisfied');--> statement-breakpoint
CREATE TABLE "claim_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"project_repo_id" uuid NOT NULL,
	"commit_sha" text NOT NULL,
	CONSTRAINT "claim_repos_claim_id_project_repo_id_unique" UNIQUE("claim_id","project_repo_id")
);
--> statement-breakpoint
CREATE TABLE "claim_requirement_versions" (
	"claim_id" uuid NOT NULL,
	"requirement_version_id" uuid NOT NULL,
	CONSTRAINT "claim_requirement_versions_claim_id_requirement_version_id_pk" PRIMARY KEY("claim_id","requirement_version_id")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"claim_id" uuid NOT NULL,
	"model_id" text NOT NULL,
	"prompt_template_version" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"evidence" jsonb NOT NULL,
	"evidence_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verdicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"requirement_version_id" uuid NOT NULL,
	"verdict" "verdict" NOT NULL,
	"rationale" text NOT NULL,
	CONSTRAINT "verdicts_evaluation_id_requirement_version_id_unique" UNIQUE("evaluation_id","requirement_version_id")
);
--> statement-breakpoint
ALTER TABLE "claim_repos" ADD CONSTRAINT "claim_repos_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_repos" ADD CONSTRAINT "claim_repos_project_repo_id_project_repos_id_fk" FOREIGN KEY ("project_repo_id") REFERENCES "public"."project_repos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_requirement_versions" ADD CONSTRAINT "claim_requirement_versions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_requirement_versions" ADD CONSTRAINT "claim_requirement_versions_requirement_version_id_requirement_versions_id_fk" FOREIGN KEY ("requirement_version_id") REFERENCES "public"."requirement_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_submitted_by_developers_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."developers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_requirement_version_id_requirement_versions_id_fk" FOREIGN KEY ("requirement_version_id") REFERENCES "public"."requirement_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verdicts_requirement_version_idx" ON "verdicts" USING btree ("requirement_version_id");