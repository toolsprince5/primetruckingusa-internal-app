# Browser and mobile password reset

Deploy the two files in `web/reset-password/` to the website document root as
`/reset-password/index.html` and `/reset-password/config.js`.

Create `config.js` from `config.example.js` on the web host, using the project's
Supabase URL and **anon** key only. Never use a Supabase service-role key here.

In Supabase Authentication URL Configuration, add this exact allowed redirect URL:

`https://primetruckingusa.com/reset-password/`

The page permits a password reset in any browser and gives phone users the option
to continue inside the installed Prime Trucking USA app.
