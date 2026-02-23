# Infrastructure

docker_compose('docker-compose.yaml')

dc_resource('postgres',
  labels=['infrastructure']
)

dc_resource('redis',
  labels=['infrastructure']
)

dc_resource('minio',
  labels=['infrastructure']
)

dc_resource('minio-init',
  labels=['infrastructure']
)

local_resource('inngest',
  serve_cmd='npx inngest-cli@latest dev -u http://localhost:3020/api/inngest',
  resource_deps=['agents'],
  labels=['infrastructure']
)

# Dependencies

local_resource('client_deps',
  cmd='cd client && dart pub get',
  labels=['dependencies']
)

local_resource('server_deps',
  cmd='cd server && bun i',
  labels=['dependencies']
)

local_resource('model_deps',
  cmd='cd models && go work sync',
  labels=['dependencies']
)

# Database

local_resource('db_generate',
  cmd='cd server/packages/db && bun run db:generate',
  resource_deps=['server_deps'],
  labels=['database']
)

local_resource('db_migrate',
  cmd='cd server/packages/db && bun run db:migrate',
  resource_deps=['postgres', 'db_generate'],
  labels=['database']
)

local_resource('introspection',
  cmd='cd models/db && go run cmd/introspect/main.go',
  resource_deps=['db_migrate'],
  labels=['database'],
  trigger_mode=TRIGGER_MODE_MANUAL,
  auto_init=False
)

local_resource('seed-database',
  cmd='cd server/packages/db && bun run db:seed',
  trigger_mode=TRIGGER_MODE_MANUAL,
  auto_init=False,
  resource_deps=['server_deps', 'postgres'],
  labels=['database']
)

local_resource('db_ui',
  serve_cmd='cd server/packages/db && bun run db:studio',
  resource_deps=['postgres', 'db_migrate'],
  labels=['tools']
)

# Services

local_resource('mcp',
  serve_cmd='cd models/mcp && CompileDaemon -build="go build -o tmp/main ." -command="./tmp/main" -graceful-kill=true -graceful-timeout=10',
  resource_deps=['model_deps'],
  labels=['services']
)

local_resource('agents',
  serve_cmd='cd models/agents && CompileDaemon -build="go build -o tmp/main ." -command="./tmp/main" -graceful-kill=true -graceful-timeout=10',
  resource_deps=['model_deps'],
  labels=['services']
)

local_resource('server',
  serve_cmd='cd server/packages/api && bun run dev',
  resource_deps=['server_deps', 'db_migrate', 'redis', 'inngest', 'minio-init'],
  labels=['services']
)

local_resource('dashboard',
  serve_cmd='cd server/packages/dashboard && bun run dev',
  resource_deps=['server_deps', 'server'],
  labels=['services']
)

local_resource('client',
  serve_cmd='cd client && flutter run -d chrome',
  resource_deps=['client_deps'],
  labels=['services']
)

local_resource('docs',
  serve_cmd='cd site && bun run dev',
  labels=['tools']
)
