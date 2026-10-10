# Simon's Travels

A personal travel blog. Each trip has one page per day, built from text, photos and videos. Anyone with the link can read it. Only you can sign in and write.

Live at <https://simonsnitz.github.io/travel/>. The editor is at <https://simonsnitz.github.io/travel/#/admin>.

## How it's put together

- **The site** is React and TypeScript, built with Vite and hosted on GitHub Pages.
- **The content** lives in a Supabase project on the free plan: a Postgres database for trips and days, Storage for photos and clips, and Auth for your one login.
- **The pages never talk to Supabase directly.** They go through `src/lib/store.ts`, which uses Supabase when it is configured and an in-memory demo with sample content when it is not.
- **Who may do what is decided in the database**, by the rules in `supabase/schema.sql`. Visitors can read trips and published days. Only the login on the admin list can write, see drafts, or upload. The key that ships with the site is the publishable one, which is public by design.

Everything runs on free tiers. The limits that come with that are listed [below](#free-plan-limits).

## Running it on your computer

```sh
npm install
npm run dev
```

Then open <http://localhost:5173>. With no settings file the site runs in **demo mode**: sample content, any email and password signs you in, and nothing is saved.

To work against your real Supabase project, copy `.env.example` to `.env.local` and fill in the two values. (`.env.production` is only used when building the live site.)

Other commands: `npm test`, `npm run typecheck`, `npm run build`.

## One-time setup

Do these in order. The order matters for step 5: your project's address should not be public before your own login is the admin.

1. **Create a Supabase project** at <https://supabase.com> on the free plan. It asks for a database password. Keep it somewhere safe. The site never needs it.

2. **Add your login.** In the dashboard go to Authentication > Users, choose Add user > Create new user, and enter your email and a strong password. Leave "Auto confirm user?" ticked. This is what you will sign in to the editor with.

3. **Create the tables.** Open the SQL Editor, paste in the whole of `supabase/schema.sql`, and run it.
   - Supabase will warn that the query "includes destructive operations". That is expected: the script removes and recreates its own access rules so that it can be run more than once. Choose **Run query**.
   - The result is a single row. **Check that `admin_email` is your email.** That login, and only that one, can edit the site.
   - If it says nobody can edit yet, it found no confirmed login. Either you ran it before step 2, or "Auto confirm user?" was unticked. Add the login (delete it first if it is there) and run the script again.
   - If it says the project has more than one login, it made nobody the admin: the script never guesses which login is yours. Delete every login that isn't yours under Authentication > Users and run it again.

   The script is safe to run again at any time. It never removes trips, days or photos.

4. **Turn off sign-ups.** Under Authentication > Sign In / Providers, switch off "Allow new users to sign up". Your own login keeps working. Other accounts could not edit or see drafts anyway, but there is no reason to let anyone create them.

5. **Tell the site where the project is.** Open the Connect dialog in the dashboard and copy the Project URL and the Publishable key (the key is also under Settings > API Keys). Put them in a file called `.env.production` in this folder:

   ```sh
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_KEY=sb_publishable_...
   ```

   This file is committed, and both values are meant to be public. **Never put the secret key in it** (the one that starts with `sb_secret_`, or is labelled `service_role`). That key bypasses every rule in the database, and this project never needs it.

6. **Switch on GitHub Pages.** In the repository on GitHub: Settings > Pages > Build and deployment > Source: **GitHub Actions**.

## Deploying

Push to `main`. GitHub Actions runs the tests, builds the site and publishes it to Pages. It takes a couple of minutes, and you can watch it under the Actions tab.

The workflow refuses to publish if `.env.production` is missing or incomplete, because the build would then be the demo site. It also refuses if the key in it looks like a secret key.

You only need to deploy when the code changes. Writing and publishing days happens in the editor and shows up straight away.

## Everyday things

- **Write.** Sign in at `/#/admin`, pick a trip and a day. A day stays a draft, hidden from visitors, until you publish it.
- **Add another trip.** Admin > New trip.
- **Change the site title or tagline.** Edit `src/config.ts`. The title also appears in `index.html`, which is what browser tabs and link previews use. Then push.
- **Change your password, or get back in after forgetting it.** The site has no password-reset page, so the recovery email that Supabase offers to send cannot be completed here. Instead, under Authentication > Users, delete your login and create it again with the new password (Add user > Create new user). Deleting it takes you off the admin list, so run `supabase/schema.sql` once more afterwards. The script only makes a login the admin when it is the only login in the project, so delete any you don't recognise first.

## Free-plan limits

| Limit | What the site does about it |
| --- | --- |
| **1 GB of storage** in total | Photos are shrunk in your browser before they are uploaded: at most 2000 pixels on the long side, saved as JPEG, plus a small thumbnail. Redrawing the photo also strips its embedded data, such as where it was taken. |
| **50 MB per file** | A clip over 50 MB is refused before the upload starts, with a message saying so. Clips are uploaded in pieces that are retried when the connection drops. |
| Longer videos | Put the video on YouTube or Vimeo and paste the link into a video block. It plays on the page and uses none of your storage. |
| **Supabase pauses a free project** that has seen little activity for about a week | A scheduled job (`.github/workflows/keep-alive.yml`) reads from the database once a day. |
| **GitHub switches off scheduled jobs** in a repository with no activity for 60 days | See below. |

### Keeping the keep-alive alive

GitHub stops running scheduled jobs in a public repository after 60 days without activity, and that includes the job that keeps Supabase awake. GitHub treats automatic workarounds for this as a breach of its terms, so the job warns you instead: once 45 days have passed since the last commit, it fails every Monday, and GitHub emails you about the failed run (unless you have turned those emails off).

When that happens, do either of these:

- Push any change to the repository. That restarts the 60 days.
- Or, if the job has already been switched off: Actions > Keep Supabase awake > Enable workflow.

If the project does get paused, nothing is lost. Supabase emails a warning beforehand, and you can resume the project from its dashboard. Do it reasonably soon: a paused project can only be resumed for a limited time. While it is paused the site cannot load any content.

### Deleting things

Deleting a day or a trip also deletes its photos and clips from storage. They are public files that browsers are told to keep for a year, so a copy can linger in caches for a while after you delete it. Treat anything you have published as already seen.

## If something goes wrong

- **"This account doesn't have permission to edit."** The login is not on the admin list. Run `supabase/schema.sql` again and read the `admin_email` and `what_next` it reports.
- **"The site's database isn't set up yet."** `supabase/schema.sql` has not been run on the project that `.env.production` points to.
- **"Couldn't reach the server"** on every page, with a working connection: the Supabase project has probably been paused. Resume it from the Supabase dashboard.
- **The deploy fails at "Configure Pages".** Step 6 above has not been done.
