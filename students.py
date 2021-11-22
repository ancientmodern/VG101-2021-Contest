names = []
ids = []

with open('students.txt', 'r') as fin:
    lines = fin.readlines()
    for line in lines:
        arr = line.split(',')
        names.append(arr[0].replace('\n', '').strip(' '))
        ids.append(arr[2].replace('\n', ''))

with open('config/students.json', 'a') as fout:
    for i in range(len(names)):
        fout.write('  "%s": {\n' % ids[i])
        fout.write('    "name": "%s",\n' % names[i])
        fout.write('    "TA": false\n')
        fout.write('  },\n')
