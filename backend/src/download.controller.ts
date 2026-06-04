import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';

// Dev convenience: serve the latest debug APK over the (port-forwarded) API port
// so an emulator/host can install it without an extra forwarded port.
@Controller()
export class DownloadController {
  @Get('app')
  app(@Res() res: Response) {
    res.download(
      '/home/winner/Documents/Poker/mobile/build/app/outputs/flutter-apk/app-debug.apk',
      'capa-contest.apk',
    );
  }
}
