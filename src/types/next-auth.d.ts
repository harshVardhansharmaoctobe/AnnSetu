import { DefaultSession } from 'next-auth';

type UserRole = 'DONOR' | 'NGO' | 'VOLUNTEER' | 'ADMIN';
type AccountStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';

declare module 'next-auth' {
  interface User {
    role: UserRole;
    accountStatus: AccountStatus;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      accountStatus: AccountStatus;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
    accountStatus: AccountStatus;
  }
}
