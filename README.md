# FitSense

FitSense is a fitness and wellbeing platform for personalized workout tracking, activity and nutrition logging, explainable recommendations, and privacy controls.

## Project introduction
The platform is organized as a monorepo with a Vite + React frontend and an Express + MongoDB backend. The dashboard, workout/activity/nutrition records, profile, recommendations, assistant, analytics, and privacy controls use authenticated API endpoints. The posture coach uses MediaPipe Pose Landmarker in the browser to check exercise-specific camera framing, estimate basic repetitions, and provide spoken guidance. Camera frames remain local; the pose model is fetched from public model/CDN endpoints when needed.

## Problem statement
Users need a single product that helps them understand training history, workout quality, behaviour trends, exercise choice, and recovery without relying on scattered tools or generic static dashboards.

## Objectives
- Provide a polished commercial-grade fitness experience.
- Use real user-owned records for dashboard and analytics features.
- Incorporate explainable, rule-based recommendations and context-aware assistant responses.
- Provide account export/deletion and privacy preference controls.

## Feature overview
- Authentication and profile management
- Dashboard summary cards and activity charts
- Workout logging and historical tracking
- Daily activities and nutrition logging
- AI recommendation engine with explainability
- Browser-local pose estimation, exercise-specific framing guidance, basic rep counting, and optional spoken cues for squats, push-ups, biceps curls, and head rotation
- Context-aware deterministic fitness assistant
- Privacy center and export/delete controls
- Android automatic walking/running detection, optional GPS routes, and Health Connect step summaries

## Technology stack
- Frontend: React + Vite + Tailwind CSS + Recharts + Lucide React + Axios
- Backend: Node.js + Express.js + MongoDB + Mongoose + JWT + bcryptjs
- Additional: Helmet, rate limiting, CORS, environment variable configuration

## System architecture
The app uses a modular frontend with a sidebar shell and route-based feature pages. The backend exposes REST endpoints under `/api`, protects user-specific routes, and stores records by user ownership.

## MongoDB design
The schema includes users, workouts, activities, nutrition, exercises, recommendations, privacy preferences, automatic activity sessions, and daily step summaries. User-owned tracking data is included in account export and deletion.

## Installation
1. `cd FitSense`
2. `npm install`
3. `cd backend && npm install`
4. `cd ../frontend && npm install`

## Environment configuration
Copy the example files and configure secrets:

- `backend/.env.example` -> `backend/.env`
- `frontend/.env.example` -> `frontend/.env`

Set a unique, high-entropy `JWT_SECRET` in `backend/.env`. In development, the API generates a temporary random secret when it is omitted; sessions expire when the backend restarts. Production startup requires an explicit secret.

## Run the app

From the root project directory:

- `npm run dev` starts both frontend and backend together
- `npm run build` creates a production frontend bundle
- `npm run lint` checks the frontend
- `npm run test` runs backend tests
- `npm start` starts the API (and serves the built frontend when available)

## Android mobile app

The separate Expo/React Native app and its Kotlin background integration live in
[`mobile/`](./mobile/). It keeps using this backend and MongoDB; it does not
replace the website. See [`mobile/README.md`](./mobile/README.md) for API setup,
permissions, build instructions, platform limitations, and the required
physical-device verification plan. Expo Go cannot run the native tracking
services.

## Production deployment

FitSense can run as one Node service: Express serves both the API and the built
single-page frontend from the same origin. This keeps the HTTP-only session
cookie working without cross-site cookie configuration.

### Deploy with Docker

1. Create a production MongoDB database (for example, MongoDB Atlas) and allow
   the deployment service to connect to it.
2. Build the image from the project root: `docker build -t fitsense .`
3. Run it with `MONGODB_URI`, a unique high-entropy `JWT_SECRET`, and
   `NODE_ENV=production`. The service listens on `PORT` (defaults to `5000`):

   ```powershell
   docker run --rm -p 5000:5000 `
     -e NODE_ENV=production `
     -e PORT=5000 `
     -e MONGODB_URI="your-production-mongodb-connection-string" `
     -e JWT_SECRET="your-long-random-secret" `
     fitsense
   ```

4. Configure the hosting provider to build with the repository root as the
   Docker context, set those environment variables in its secret manager, and
   use `/api/health` as its health-check path. Do not commit real credentials.
5. Open the deployment URL; `/` serves the app and `/api/health` verifies API
   and database readiness.

Production startup intentionally fails if `MONGODB_URI` or `JWT_SECRET` is
missing. Use HTTPS at the hosting provider so secure session cookies work.
Keep the database private and restrict its network access to the app host.

## API overview
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/mobile/register`, `POST /api/auth/mobile/login`
- `GET /api/auth/me`, `PUT /api/auth/profile`, `POST /api/auth/logout`
- `GET/PUT /api/tracking/preferences`
- `PUT /api/tracking/daily-steps/:dayKey`
- `GET /api/tracking/sessions`, `PUT /api/tracking/sessions/:clientSessionId`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/analytics`
- `GET/POST/PUT/DELETE /api/workouts`
- `GET/POST/PUT/DELETE /api/activities`
- `GET/POST/PUT/DELETE /api/nutrition`
- `GET /api/recommendations`, `PATCH /api/recommendations/:id/feedback`
- `POST /api/assistant/message`
- `GET/PUT /api/privacy`, `GET /api/privacy/export`, `DELETE /api/privacy/account`

Website routes use the authenticated session cookie; mobile routes accept its
mobile bearer token. Both scope database queries to the signed-in user.

## Screenshots
This project includes a working front-end shell and feature pages designed for a premium fitness product aesthetic. Add screenshots as the project evolves.

## Posture coach limitations
- Exercise feedback uses transparent joint-angle thresholds, not a model trained on FitSense exercise videos; it is a basic coaching aid, not a medical assessment.
- The exercise is currently selected by the user; automatic exercise classification is not included.
- Head rotation is estimated from nose position relative to the shoulders and is a movement proxy, not a clinically validated measure of neck rotation.
- Camera placement, lighting, clothing, and individual movement patterns can affect pose estimates. Validate against labeled participants and report per-exercise results before making accuracy claims.
- Raw camera frames are processed locally and are not uploaded. The MediaPipe runtime and pose model are downloaded from public endpoints when the coach starts.

## Future enhancements
- Deeper MongoDB analytics pipelines
- Conversation memory and optional LLM integration
- Exportable health reports and advanced privacy controls
