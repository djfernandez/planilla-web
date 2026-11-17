import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ALLOW_INACTIVE = 'allowInactive';
export const AllowInactive = () => SetMetadata(ALLOW_INACTIVE, true);
