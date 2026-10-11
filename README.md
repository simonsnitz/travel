# Backup copy

This branch is written by the Deploy workflow. It holds a copy of everything
that is published on the site:

- `index.json`, `days/`, `day/`: the trips and their published days
- `media/`: their photos and clips

The site serves this copy to readers whenever the database can't be reached.
Don't edit it by hand: the next run overwrites it from the database.
