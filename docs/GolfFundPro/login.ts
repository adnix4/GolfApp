// login credentials adnix4@gmail.com / GFPpassword1
// pgAdmin (just the database viewer, not the app) is separate — those credentials are fixed: admin@local.dev / admin
/*
  ┌─────────────────┬──────────────────────────────────┬───────────────────────┐
  │       App       │             Command              │          URL          │
  ├─────────────────┼──────────────────────────────────┼───────────────────────┤
  │ Admin dashboard │ cd apps/admin && npm run dev     │ http://localhost:8081 │
  ├─────────────────┼──────────────────────────────────┼───────────────────────┤
  │ Public web      │ cd apps/web && npm run dev       │ http://localhost:3000 │
  ├─────────────────┼──────────────────────────────────┼───────────────────────┤
  │ Mobile          │ cd apps/mobile && npx expo start │ Expo Go on your phone │
  └─────────────────┴──────────────────────────────────┴───────────────────────┘
  */