import db from './knex';

test('runMigrations applies the latest Knex migrations', async () => {
  let called = false;

  const fakeDatabase: any = {
    migrate: {
      latest: async () => {
        called = true;
        return [1, []];
      },
    },
  };

  const result = await db.runMigrations(fakeDatabase);

  expect(called).toBe(true);
  expect(result).toEqual([1, []]);
});
