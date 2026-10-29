"""Cross-check sample Jie instants against JPL DE421 apparent solar longitude.

Optional dev dependencies: skyfield 1.53 and skyfield-data 6.0.0. The DE421
kernel covers 1899-07-28 to 2053-10-08, so this samples 1900-2050 only.
A numerical astronomy check is not an official calendar certification.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

import numpy as np
import skyfield_data
from skyfield.api import load, load_file
from skyfield.framelib import ecliptic_frame
from lunar_python import Solar

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Solar longitude in the true ecliptic/equinox of date, degrees.
LONGITUDES = {'小寒': 285, '立春': 315, '惊蛰': 345, '清明': 15,
              '立夏': 45, '芒种': 75, '小暑': 105, '立秋': 135,
              '白露': 165, '寒露': 195, '立冬': 225, '大雪': 255}
UTC8 = timezone(timedelta(hours=8))
epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
ts = load.timescale(builtin=True)
kernel = load_file(str(Path(skyfield_data.__file__).parent / 'data' / 'de421.bsp'))
earth, sun = kernel['earth'], kernel['sun']


def longitude_delta(seconds, targets):
    dates = [epoch + timedelta(seconds=float(value)) for value in seconds]
    time = ts.from_datetimes(dates)
    _, lon, _ = earth.at(time).observe(sun).apparent().frame_latlon(ecliptic_frame)
    return (lon.degrees - targets + 180) % 360 - 180


def main():
    samples = []
    for year in range(1900, 2051, 5):
        for month in range(1, 13):
            term = Solar.fromYmdHms(year, month, 20, 12, 0, 0).getLunar().getPrevJie()
            moment = datetime.strptime(term.getSolar().toYmdHms(), '%Y-%m-%d %H:%M:%S').replace(tzinfo=UTC8)
            samples.append((term.getName(), moment))
    targets = np.array([LONGITUDES[name] for name, _ in samples])
    recorded = np.array([(moment.astimezone(timezone.utc) - epoch).total_seconds() for _, moment in samples])
    low, high = recorded - 300, recorded + 300
    if np.any(longitude_delta(low, targets) >= 0) or np.any(longitude_delta(high, targets) <= 0):
        raise AssertionError('有节气交接超出独立星历比较窗口（±5 分钟）')
    for _ in range(12):
        middle = (low + high) / 2
        before = longitude_delta(middle, targets) < 0
        low = np.where(before, middle, low)
        high = np.where(before, high, middle)
    differences = (low + high) / 2 - recorded
    worst = int(np.argmax(np.abs(differences)))
    name, moment = samples[worst]
    print(f'JPL DE421 独立星历：{len(samples)} 个节气样本（1900–2050，每 5 年 12 节）')
    print(f'最大绝对时差：{abs(differences[worst]):.1f} 秒；{name} {moment:%Y-%m-%d %H:%M:%S %z}')
    print('采用真黄经交点，样本结果不等于权威历表逐条认证。')
    if abs(differences[worst]) > 120:
        raise AssertionError('星历比较误差超过当前两分钟边界提示窗口')


if __name__ == '__main__':
    main()
