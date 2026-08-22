export type ManagedAccessUser = {
  role: string;
  status: 'Ativo' | 'Bloqueado' | 'Expirado' | 'Excluído';
  createdAtIso: string;
};

export function summarizeAccessUsers(users: ManagedAccessUser[], now = new Date()) {
  const teachers = users.filter((user) => user.role === 'professor');
  const sameLocalDay = (value: string) => new Date(value).toDateString() === now.toDateString();
  return {
    usersTotal: users.filter((user) => user.status !== 'Excluído').length,
    total: teachers.filter((user) => user.status !== 'Excluído').length,
    active: teachers.filter((user) => user.status === 'Ativo').length,
    blocked: teachers.filter((user) => user.status === 'Bloqueado').length,
    expired: teachers.filter((user) => user.status === 'Expirado').length,
    deleted: teachers.filter((user) => user.status === 'Excluído').length,
    newToday: teachers.filter((user) => user.status !== 'Excluído' && sameLocalDay(user.createdAtIso)).length,
  };
}

export function registrationEventKey(userId: string) {
  return `registration:${userId}`;
}
