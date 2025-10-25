# GeoStress - Dynamic Line Rating System

Real-time transmission line thermal stress analysis for power grid management.

## Project info

**URL**: https://lovable.dev/projects/2f5494e7-8f88-45d1-8461-0d58756a9a46

## Features

### Dynamic Line Rating
- Real-time transmission line stress calculation using IEEE-738 standard
- Environmental factor integration (temperature, wind speed, wind direction)
- Visual stress indicators on interactive map
- Multiple scenario support (min, nominal, max load)

### N-1 Contingency Analysis
Evaluate system resilience by simulating single-line outages. The analysis:
- Simulates loss of any transmission line
- Identifies neighbor lines that would absorb additional load
- Calculates post-outage stress levels for all affected lines
- Reports top 10 most critical contingencies
- Visualizes outage scenarios on the map with:
  - Gray dashed lines for outage
  - Highlighted affected lines with stress colors
  - Interactive contingency selection

**Note:** Full N-1 contingency requires a power-flow solver (PyPSA, MATPOWER).
Our prototype uses a topological heuristic to demonstrate outage impact for hackathon purposes.

### System Statistics
- Overall system stress index
- Stress distribution across lines (Safe/Warning/High/Overload)
- First-to-fail line identification
- Real-time thermal limit calculations

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/2f5494e7-8f88-45d1-8461-0d58756a9a46) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/2f5494e7-8f88-45d1-8461-0d58756a9a46) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
