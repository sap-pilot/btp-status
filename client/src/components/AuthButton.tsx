import { LogIn } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { AuthState } from '@/hooks/useAuth';

interface Props {
  auth: AuthState & { login: () => void; logout: () => void };
}

export default function AuthButton({ auth }: Props) {
  if (!auth.enabled) return null;

  if (!auth.loggedIn) {
    return (
      <button
        onClick={auth.login}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="Click to login"
      >
        <LogIn className="h-4 w-4" />
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={`Logged in as ${auth.firstName}`}
        >
          <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold leading-none select-none">
            {auth.initials || auth.firstName.slice(0, 1).toUpperCase()}
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Welcome, {auth.firstName}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs cursor-pointer" onSelect={auth.logout}>
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
