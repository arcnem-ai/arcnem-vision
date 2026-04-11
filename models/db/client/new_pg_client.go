package client

import (
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	pgClientOnce sync.Once
	pgClient     *gorm.DB
	pgClientErr  error
)

func NewPGClient() (*gorm.DB, error) {
	pgClientOnce.Do(func() {
		databaseURL := os.Getenv("DATABASE_URL")
		if databaseURL == "" {
			pgClientErr = fmt.Errorf("DATABASE_URL not set")
			return
		}

		pg := postgres.New(postgres.Config{
			DSN:                  databaseURL,
			PreferSimpleProtocol: true,
		})

		pgClient, pgClientErr = gorm.Open(pg, &gorm.Config{
			Logger: logger.New(
				log.New(os.Stdout, "", 0),
				logger.Config{
					SlowThreshold:             100 * time.Second,
					LogLevel:                  logger.Info,
					IgnoreRecordNotFoundError: true,
					Colorful:                  true,
				},
			),
		})
		if pgClientErr != nil {
			pgClientErr = fmt.Errorf("failed to connect database: %w", pgClientErr)
		}
	})

	return pgClient, pgClientErr
}
