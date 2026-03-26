import { AlertCircle } from 'lucide-react';

interface TrialExpiredBannerProps {
  className?: string;
}

export function TrialExpiredBanner({ className = '' }: TrialExpiredBannerProps) {
  return (
    <div className={`bg-gradient-to-r from-red-600 to-red-700 text-white ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <div>
              <p className="font-semibold text-lg">Free Trial Expired</p>
              <p className="text-red-100 text-sm">
                Subscribe now to continue receiving trading signals and EA instructions
              </p>
            </div>
          </div>
          <a
            href="#pricing"
            className="bg-white text-red-600 px-6 py-2 rounded-lg font-semibold hover:bg-red-50 transition-colors"
          >
            View Plans
          </a>
        </div>
      </div>
    </div>
  );
}
