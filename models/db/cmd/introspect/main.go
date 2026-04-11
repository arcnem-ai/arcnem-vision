package main

import (
	"fmt"
	"log"
	"os"

	"github.com/arcnem-ai/arcnem-vision/models/shared/env"
	"gorm.io/driver/postgres"
	"gorm.io/gen"
	"gorm.io/gorm"
)

func main() {
	if err := env.LoadEnv(); err != nil {
		log.Fatal(fmt.Errorf("load env: %w", err))
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL not set")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	g := gen.NewGenerator(gen.Config{
		OutPath:           "./gen/queries",
		ModelPkgPath:      "./gen/models",
		FieldNullable:     true,
		FieldCoverable:    false,
		FieldSignable:     false,
		FieldWithIndexTag: false,
		FieldWithTypeTag:  true,
	})

	g.UseDB(db)

	var tables []string
	db.Raw("SELECT tablename FROM pg_tables WHERE schemaname = 'public'").Scan(&tables)

	for _, table := range tables {
		if table != "__drizzle_migrations" {
			g.ApplyBasic(g.GenerateModel(table))
		}
	}

	g.Execute()

	log.Println("✅ Models generated successfully in ./db/models and ./db/query")
}
